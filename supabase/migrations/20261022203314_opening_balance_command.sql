create function public.opening_balance() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('amount_cents',opening_balance_cents::text,'occurred_at',opening_balance_at) from public.business_settings where owner_id=(select auth.uid());
$$;
revoke all on function public.opening_balance() from public,anon,authenticated;
grant execute on function public.opening_balance() to authenticated;
create function private.opening_balance_command(p_command_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();v_hash text;v_previous private.command_receipts%rowtype;v_amount numeric;v_at timestamptz;v_revision bigint;
begin
 if v_owner is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 if p_command_id is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Operação inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_owner::text,0));perform private.initialize_own_account();
 v_hash:=encode(extensions.digest(jsonb_build_object('entity','opening_balance','id',v_owner,'data',p_data)::text,'sha256'),'hex');
 select * into v_previous from private.command_receipts where owner_id=v_owner and command_id=p_command_id;
 if found then
  if v_previous.input_hash<>v_hash then raise exception 'Tentativa já utilizada com outros dados.' using errcode='22023';end if;
  return jsonb_build_object('status','saved');
 end if;
 v_amount:=(p_data->>'amount_cents')::numeric;
 if v_amount is null or v_amount<>trunc(v_amount) or v_amount < -100000000000 or v_amount>100000000000 or (p_data->>'confirm') is distinct from 'true' then raise exception 'Confira o valor e confirme a alteração do saldo inicial.' using errcode='22023';end if;
 v_at:=private.business_instant(p_data->>'occurred_local');
 update public.business_settings set opening_balance_cents=v_amount::bigint,opening_balance_at=v_at where owner_id=v_owner;
 insert into private.command_receipts(owner_id,command_id,input_hash,target_id) values(v_owner,p_command_id,v_hash,v_owner);
 insert into public.account_sync_state(owner_id,revision) values(v_owner,1) on conflict(owner_id) do update set revision=public.account_sync_state.revision+1 returning revision into v_revision;
 perform realtime.send(jsonb_build_object('revision',v_revision),'changed','account:'||v_owner::text,true);
 return jsonb_build_object('status','saved');
end;$$;
revoke all on function private.opening_balance_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.opening_balance_command(uuid,jsonb) to authenticated;
create function public.opening_balance_command(p_command_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as 'select private.opening_balance_command(p_command_id,p_data)';
revoke all on function public.opening_balance_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.opening_balance_command(uuid,jsonb) to authenticated;
revoke update(opening_balance_cents,opening_balance_at) on public.business_settings from authenticated;
