begin;
select set_config('test.a',gen_random_uuid()::text,true);
select set_config('test.b',gen_random_uuid()::text,true);
select set_config('test.material',gen_random_uuid()::text,true);
select set_config('test.recipe',gen_random_uuid()::text,true);
select set_config('test.key',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.a')::uuid,'TESTE-recipes-a@example.invalid'),(current_setting('test.b')::uuid,'TESTE-recipes-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
select public.material_command(gen_random_uuid(),'create',current_setting('test.material')::uuid,'{"name":"TESTE Cacau","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":3072}');
select set_config('test.payload',jsonb_build_object('name','TESTE Brigadeiro','yield_units','5.0','indirect_percent',25,'fee_percent',5.49,'final_quantity',500,'final_unit','g','serving_quantity',25,'serving_unit','g','components',jsonb_build_array(jsonb_build_object('material_id',current_setting('test.material'),'quantity',500,'unit','g')))::text,true);
select public.recipe_command(current_setting('test.key')::uuid,'create',current_setting('test.recipe')::uuid,current_setting('test.payload')::jsonb);
select public.recipe_command(current_setting('test.key')::uuid,'create',current_setting('test.recipe')::uuid,current_setting('test.payload')::jsonb);
do $$ declare p jsonb; result jsonb; begin
  select pricing into p from public.recipe_catalog where id=current_setting('test.recipe')::uuid;
  if (p->>'unit_cost')::numeric<>3.84 or (p->>'suggested_cents')::numeric<>1219 or (p->>'fee_cents')::numeric<>67 or (p->>'profit_cents')::numeric<>768 then raise exception 'TESTE fórmula: %',p; end if;
  if (p->>'raw_edible_g')::numeric<>500 then raise exception 'TESTE peso'; end if;
  if (select count(*) from public.recipes)<>1 or (select revision from public.account_sync_state)<>2 then raise exception 'TESTE duplicação'; end if;
  begin
    perform public.recipe_command(gen_random_uuid(),'create',gen_random_uuid(),current_setting('test.payload')::jsonb || '{"name":"  teste   brigadeiro  "}');
    raise exception 'TESTE nome duplicado';
  exception when unique_violation then null; end;
  begin
    perform public.recipe_command(gen_random_uuid(),'update',current_setting('test.recipe')::uuid,current_setting('test.payload')::jsonb || '{"name":"TESTE inválida","yield_units":0}');
    raise exception 'TESTE rendimento zero';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.recipe_command(gen_random_uuid(),'update',current_setting('test.recipe')::uuid,current_setting('test.payload')::jsonb || jsonb_build_object('name','TESTE inválida','components',jsonb_build_array(jsonb_build_object('material_id',gen_random_uuid(),'quantity',1,'unit','g'))));
    raise exception 'TESTE composição inexistente';
  exception when no_data_found then null; end;
  if (select name from public.recipes)<>'TESTE Brigadeiro' or (select count(*) from public.recipe_materials)<>1 then raise exception 'TESTE rollback da composição'; end if;
  result:=public.recipe_preview(current_setting('test.payload')::jsonb || '{"yield_units":null}');
  if (result->>'ready')::boolean or result->>'suggested_cents' is not null then raise exception 'TESTE receita incompleta'; end if;
  result:=public.recipe_preview(current_setting('test.payload')::jsonb || '{"final_quantity":null}');
  if (result->>'ready')::boolean then raise exception 'TESTE falta peso final'; end if;
  begin
    perform public.material_command(gen_random_uuid(),'delete',current_setting('test.material')::uuid,'{}');
    raise exception 'TESTE exclusão de insumo usado';
  exception when foreign_key_violation then
    if sqlerrm not like 'Usado em: TESTE Brigadeiro.%' then raise exception 'TESTE explicação de dependência: %',sqlerrm; end if;
  end;
  begin
    perform public.material_command(gen_random_uuid(),'update',current_setting('test.material')::uuid,'{"name":"TESTE Cacau","kind":"ingredient","unit":"g","package_quantity":1000,"package_price_cents":3072}');
    raise exception 'TESTE unidade reinterpretada';
  exception when foreign_key_violation then null; end;
  perform public.material_command(gen_random_uuid(),'update',current_setting('test.material')::uuid,'{"name":"TESTE Cacau","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":6144}');
  select pricing into p from public.recipe_catalog;
  if (p->>'unit_cost')::numeric<>7.68 then raise exception 'TESTE preço não acompanha insumo'; end if;
  begin update public.recipes set name='TESTE direto'; raise exception 'TESTE escrita direta'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
select public.initialize_account();
do $$ begin
  if exists(select 1 from public.recipe_catalog) or exists(select 1 from public.recipe_materials) then raise exception 'TESTE leitura entre contas'; end if;
  begin perform public.recipe_command(gen_random_uuid(),'delete',current_setting('test.recipe')::uuid,'{}'); raise exception 'TESTE exclusão entre contas'; exception when no_data_found then null; end;
  begin perform public.recipe_command(gen_random_uuid(),'create',gen_random_uuid(),current_setting('test.payload')::jsonb); raise exception 'TESTE insumo entre contas'; exception when no_data_found then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
select public.recipe_command(gen_random_uuid(),'delete',current_setting('test.recipe')::uuid,'{}');
do $$ declare result jsonb; begin
  result:=public.recipe_command(current_setting('test.key')::uuid,'create',current_setting('test.recipe')::uuid,current_setting('test.payload')::jsonb);
  if result->>'status'<>'gone' or exists(select 1 from public.recipe_materials) or exists(select 1 from public.recipes) then raise exception 'TESTE recriação após exclusão'; end if;
  begin perform public.recipe_command(gen_random_uuid(),'update',current_setting('test.recipe')::uuid,current_setting('test.payload')::jsonb); raise exception 'TESTE edição recria'; exception when no_data_found then null; end;
  perform public.material_command(gen_random_uuid(),'delete',current_setting('test.material')::uuid,'{}');
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform * from public.recipe_catalog; raise exception 'TESTE leitura anônima'; exception when insufficient_privilege then null; end;
  begin perform public.recipe_preview('{}'); raise exception 'TESTE cálculo anônimo'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Receitas: cálculos, isolamento, atomicidade, dependências e idempotência aprovados; testes revertidos.' as resultado;
