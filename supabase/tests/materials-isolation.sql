begin;
select set_config('test.owner_a',gen_random_uuid()::text,true);
select set_config('test.owner_b',gen_random_uuid()::text,true);
select set_config('test.item',gen_random_uuid()::text,true);
select set_config('test.create_key',gen_random_uuid()::text,true);
select set_config('test.delete_key',gen_random_uuid()::text,true);
select set_config('test.payload','{"name":"TESTE Farinha","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":890,"nutrition":{"base_unit":"g","source":"TESTE rótulo","energy_kcal":0}}',true);
insert into auth.users(id,email) values(current_setting('test.owner_a')::uuid,'TESTE-etapa5-a@example.invalid'),(current_setting('test.owner_b')::uuid,'TESTE-etapa5-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner_a'),true);
select public.material_command(current_setting('test.create_key')::uuid,'create',current_setting('test.item')::uuid,current_setting('test.payload')::jsonb);
select public.material_command(current_setting('test.create_key')::uuid,'create',current_setting('test.item')::uuid,current_setting('test.payload')::jsonb);
do $$ begin
  if (select count(*) from public.materials) <> 1 then raise exception 'TESTE duplicação'; end if;
  if (select revision from public.account_sync_state) <> 1 then raise exception 'TESTE revisão'; end if;
  if (select energy_kcal from public.material_nutrition) <> 0 or (select carbohydrates_g from public.material_nutrition) is not null then raise exception 'TESTE zero e ausência'; end if;
  begin
    perform public.material_command(current_setting('test.create_key')::uuid,'create',current_setting('test.item')::uuid,'{}');
    raise exception 'TESTE reutilização alterada';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.material_command(gen_random_uuid(),'create',gen_random_uuid(),current_setting('test.payload')::jsonb || '{"name":"  teste   farinha  "}'::jsonb);
    raise exception 'TESTE nome duplicado';
  exception when unique_violation then null; end;
  begin
    perform public.material_command(gen_random_uuid(),'create',gen_random_uuid(),current_setting('test.payload')::jsonb || '{"name":"TESTE inválido","package_quantity":0}'::jsonb);
    raise exception 'TESTE quantidade zero';
  exception when check_violation then null; end;
  begin
    perform public.material_command(gen_random_uuid(),'create',gen_random_uuid(),current_setting('test.payload')::jsonb || '{"name":"TESTE pote","kind":"packaging","unit":"g"}'::jsonb);
    raise exception 'TESTE embalagem por massa';
  exception when check_violation then null; end;
  begin
    perform public.material_command(gen_random_uuid(),'update',current_setting('test.item')::uuid,current_setting('test.payload')::jsonb || '{"name":"TESTE alteração inválida","nutrition":{"base_unit":"g","energy_kcal":-1}}'::jsonb);
    raise exception 'TESTE nutrição negativa';
  exception when check_violation then null; end;
  if (select name from public.materials) <> 'TESTE Farinha' then raise exception 'TESTE escrita não atômica'; end if;
  begin
    update public.materials set name='TESTE escrita direta';
    raise exception 'TESTE escrita direta liberada';
  exception when insufficient_privilege then null; end;
  begin
    perform * from private.command_receipts;
    raise exception 'TESTE recibos expostos';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner_b'),true);
select public.initialize_account();
do $$ begin
  if exists(select 1 from public.materials) or exists(select 1 from public.material_nutrition) or exists(select 1 from public.account_sync_state) then raise exception 'TESTE vazamento entre contas'; end if;
  begin
    perform public.material_command(gen_random_uuid(),'delete',current_setting('test.item')::uuid,'{}');
    raise exception 'TESTE exclusão cruzada';
  exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner_a'),true);
select public.material_command(current_setting('test.delete_key')::uuid,'delete',current_setting('test.item')::uuid,'{}');
select public.material_command(current_setting('test.delete_key')::uuid,'delete',current_setting('test.item')::uuid,'{}');
do $$ declare result jsonb; begin
  result:=public.material_command(current_setting('test.create_key')::uuid,'create',current_setting('test.item')::uuid,current_setting('test.payload')::jsonb);
  if result->>'status' <> 'gone' then raise exception 'TESTE recriação de excluído'; end if;
  if exists(select 1 from public.materials) or exists(select 1 from public.material_nutrition) then raise exception 'TESTE exclusão incompleta'; end if;
  if (select revision from public.account_sync_state) <> 2 then raise exception 'TESTE revisão de exclusão'; end if;
  begin
    perform public.material_command(gen_random_uuid(),'update',current_setting('test.item')::uuid,current_setting('test.payload')::jsonb);
    raise exception 'TESTE edição ressuscitou item';
  exception when no_data_found then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.materials; raise exception 'TESTE leitura anônima'; exception when insufficient_privilege then null; end;
  begin perform public.material_command(gen_random_uuid(),'create',gen_random_uuid(),'{}'); raise exception 'TESTE comando anônimo'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Isolamento, validações, atomicidade, repetição de pedidos e não recriação de excluídos: aprovados. Dados de teste revertidos.' as resultado;
