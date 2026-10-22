create function private.expense_command(p_command_id uuid,p_entity text,p_action text,p_target_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_owner uuid:=auth.uid();v_hash text;v_receipt private.command_receipts%rowtype;v_exists boolean;v_name text;v_amount numeric;v_category uuid;v_at timestamptz;v_revision bigint;
begin
 if v_owner is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 if p_command_id is null or p_target_id is null or coalesce(p_entity,'') not in ('expense','expense_category') or coalesce(p_action,'') not in ('create','update','delete') or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Operação inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));perform private.initialize_own_account();
 v_hash:=encode(extensions.digest(jsonb_build_object('entity',p_entity,'action',p_action,'id',p_target_id,'data',p_data)::text,'sha256'),'hex');
 select * into v_receipt from private.command_receipts where owner_id=v_owner and command_id=p_command_id;
 if found then
  if v_receipt.input_hash<>v_hash then raise exception 'Esta tentativa já foi usada com outros dados.' using errcode='22023';end if;
  v_exists:=case when p_entity='expense' then exists(select 1 from public.expenses where owner_id=v_owner and id=v_receipt.target_id) else exists(select 1 from public.expense_categories where owner_id=v_owner and id=v_receipt.target_id) end;
  return jsonb_build_object('id',v_receipt.target_id,'status',case when v_exists then 'saved' else 'gone' end);
 end if;
 v_exists:=case when p_entity='expense' then exists(select 1 from public.expenses where owner_id=v_owner and id=p_target_id) else exists(select 1 from public.expense_categories where owner_id=v_owner and id=p_target_id) end;
 if p_action in ('update','delete') and not v_exists then raise exception 'Gasto ou categoria indisponível. Atualize a lista.' using errcode='P0002';end if;
 if p_entity='expense_category' then
  if p_action='delete' then delete from public.expense_categories where owner_id=v_owner and id=p_target_id;
  else
   v_name:=regexp_replace(btrim(p_data->>'name'),'\s+',' ','g');
   if v_name is null or length(v_name) not between 1 and 100 then raise exception 'Informe o nome da categoria com até 100 caracteres.' using errcode='22023';end if;
   if p_action='create' then insert into public.expense_categories(id,owner_id,name) values(p_target_id,v_owner,v_name);
   else update public.expense_categories set name=v_name where owner_id=v_owner and id=p_target_id;end if;
  end if;
 else
  if p_action='delete' then delete from public.expenses where owner_id=v_owner and id=p_target_id;
  else
   v_name:=regexp_replace(btrim(p_data->>'description'),'\s+',' ','g');v_amount:=(p_data->>'amount_cents')::numeric;v_category:=(p_data->>'category_id')::uuid;
   if v_name is null or length(v_name) not between 1 and 200 or v_amount is null or v_amount<=0 or v_amount>100000000000 or v_amount<>trunc(v_amount) then raise exception 'Informe uma descrição e um valor maior que zero, em centavos inteiros.' using errcode='22023';end if;
   if v_category is not null and not exists(select 1 from public.expense_categories where owner_id=v_owner and id=v_category) then raise exception 'Categoria indisponível. Escolha outra categoria ou Sem categoria.' using errcode='P0002';end if;
   v_at:=private.business_instant(p_data->>'occurred_local');
   if p_action='create' then insert into public.expenses(id,owner_id,description,amount_cents,category_id,occurred_at) values(p_target_id,v_owner,v_name,v_amount::bigint,v_category,v_at);
   else update public.expenses set description=v_name,amount_cents=v_amount::bigint,category_id=v_category,occurred_at=v_at where owner_id=v_owner and id=p_target_id;end if;
  end if;
 end if;
 insert into private.command_receipts(owner_id,command_id,input_hash,target_id) values(v_owner,p_command_id,v_hash,p_target_id);
 insert into public.account_sync_state(owner_id,revision) values(v_owner,1) on conflict(owner_id) do update set revision=public.account_sync_state.revision+1 returning revision into v_revision;
 perform realtime.send(jsonb_build_object('revision',v_revision),'changed','account:'||v_owner::text,true);
 return jsonb_build_object('id',p_target_id,'status',case when p_action='delete' then 'gone' else 'saved' end);
end;$$;
revoke all on function private.expense_command(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.expense_command(uuid,text,text,uuid,jsonb) to authenticated;
create function public.expense_command(p_command_id uuid,p_entity text,p_action text,p_target_id uuid,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as 'select private.expense_command(p_command_id,p_entity,p_action,p_target_id,p_data)';
revoke all on function public.expense_command(uuid,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.expense_command(uuid,text,text,uuid,jsonb) to authenticated;
