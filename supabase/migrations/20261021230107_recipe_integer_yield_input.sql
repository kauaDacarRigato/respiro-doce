-- Aceita 5 e 5.0 como inteiros sem aceitar rendimento fracionado.
create or replace function private.recipe_command(command_id uuid,action text,recipe_id uuid,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare account_id uuid:=auth.uid(); fingerprint text; previous private.command_receipts%rowtype; next_revision bigint; item public.recipes%rowtype;
begin
  if account_id is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if command_id is null or recipe_id is null or action is null or action not in ('create','update','delete') or data is null or jsonb_typeof(data)<>'object' then raise exception 'Operação inválida' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id::text,0));
  perform private.initialize_own_account();
  fingerprint:=encode(extensions.digest(jsonb_build_object('entity','recipe','action',action,'id',recipe_id,'data',data)::text,'sha256'),'hex');
  select * into previous from private.command_receipts r where r.owner_id=account_id and r.command_id=command_id;
  if found then
    if previous.input_hash<>fingerprint then raise exception 'Esta tentativa já foi usada com outros dados.' using errcode='22023'; end if;
    return jsonb_build_object('id',previous.target_id,'status',case when exists(select 1 from public.recipes where owner_id=account_id and id=previous.target_id) then 'saved' else 'gone' end);
  end if;
  if action in ('update','delete') and not exists(select 1 from public.recipes where owner_id=account_id and id=recipe_id) then raise exception 'Esta receita não está mais disponível.' using errcode='P0002'; end if;
  if action='delete' then delete from public.recipes where owner_id=account_id and id=recipe_id;
  else
    perform private.recipe_calculate(data);
    item.name:=regexp_replace(btrim(data->>'name'),'\s+',' ','g');
    item.yield_units:=(data->>'yield_units')::numeric::integer; item.indirect_percent:=(data->>'indirect_percent')::numeric;
    item.fee_percent:=(data->>'fee_percent')::numeric; item.final_quantity:=(data->>'final_quantity')::numeric;
    item.final_unit:=data->>'final_unit'; item.serving_quantity:=(data->>'serving_quantity')::numeric;
    item.serving_unit:=data->>'serving_unit'; item.household_measure:=coalesce(data->>'household_measure','');
    if action='create' then
      insert into public.recipes(id,owner_id,name,yield_units,indirect_percent,fee_percent,final_quantity,final_unit,serving_quantity,serving_unit,household_measure)
      values(recipe_id,account_id,item.name,item.yield_units,item.indirect_percent,item.fee_percent,item.final_quantity,item.final_unit,item.serving_quantity,item.serving_unit,item.household_measure);
    else
      update public.recipes set name=item.name,yield_units=item.yield_units,indirect_percent=item.indirect_percent,fee_percent=item.fee_percent,
      final_quantity=item.final_quantity,final_unit=item.final_unit,serving_quantity=item.serving_quantity,serving_unit=item.serving_unit,household_measure=item.household_measure where owner_id=account_id and id=recipe_id;
      delete from public.recipe_materials where owner_id=account_id and recipe_id=recipe_command.recipe_id;
    end if;
    insert into public.recipe_materials(owner_id,recipe_id,material_id,quantity,unit)
      select account_id,recipe_id,(c->>'material_id')::uuid,(c->>'quantity')::numeric,c->>'unit' from jsonb_array_elements(data->'components') c;
  end if;
  insert into private.command_receipts(owner_id,command_id,input_hash,target_id) values(account_id,command_id,fingerprint,recipe_id);
  insert into public.account_sync_state(owner_id,revision) values(account_id,1) on conflict(owner_id) do update set revision=public.account_sync_state.revision+1 returning revision into next_revision;
  perform realtime.send(jsonb_build_object('revision',next_revision),'changed','account:'||account_id::text,true);
  return jsonb_build_object('id',recipe_id,'status',case when action='delete' then 'gone' else 'saved' end);
end; $$;
