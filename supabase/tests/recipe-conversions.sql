begin;
select set_config('test.a',gen_random_uuid()::text,true);
select set_config('test.flour',gen_random_uuid()::text,true);
select set_config('test.milk',gen_random_uuid()::text,true);
select set_config('test.egg',gen_random_uuid()::text,true);
select set_config('test.box',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.a')::uuid,'TESTE-conversions@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
select public.material_command(gen_random_uuid(),'create',current_setting('test.flour')::uuid,'{"name":"TESTE Farinha","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":1000}');
select public.material_command(gen_random_uuid(),'create',current_setting('test.milk')::uuid,'{"name":"TESTE Leite","kind":"ingredient","unit":"l","package_quantity":1,"package_price_cents":1000,"density_g_ml":1.2}');
select public.material_command(gen_random_uuid(),'create',current_setting('test.egg')::uuid,'{"name":"TESTE Ovo","kind":"ingredient","unit":"un","package_quantity":10,"package_price_cents":1000,"piece_weight_g":50}');
select public.material_command(gen_random_uuid(),'create',current_setting('test.box')::uuid,'{"name":"TESTE Pote","kind":"packaging","unit":"un","package_quantity":100,"package_price_cents":1000}');
select set_config('test.base','{"name":"TESTE Conversão","yield_units":10,"indirect_percent":25,"fee_percent":0,"final_quantity":1000,"final_unit":"g","serving_unit":"g"}',true);
do $$ declare p jsonb; components jsonb; begin
  components:=jsonb_build_array(
    jsonb_build_object('material_id',current_setting('test.flour'),'quantity',0.1,'unit','kg'),
    jsonb_build_object('material_id',current_setting('test.milk'),'quantity',120,'unit','g'),
    jsonb_build_object('material_id',current_setting('test.egg'),'quantity',100,'unit','g'),
    jsonb_build_object('material_id',current_setting('test.box'),'quantity',10,'unit','un'));
  p:=public.recipe_preview(current_setting('test.base')::jsonb || jsonb_build_object('components',components));
  if (p->>'direct')::numeric<>5 or (p->>'packaging')::numeric<>1 or (p->>'raw_edible_g')::numeric<>320 or (p->>'unit_cost')::numeric<>0.625 or (p->>'suggested_cents')::numeric<>188 then raise exception 'TESTE conversão / arredondamento: %',p; end if;
  -- 0,1 L equivale a 120 g somente com densidade explícita.
  components:=jsonb_build_array(jsonb_build_object('material_id',current_setting('test.milk'),'quantity',0.1,'unit','l'));
  p:=public.recipe_preview(current_setting('test.base')::jsonb || jsonb_build_object('components',components));
  if (p->>'direct')::numeric<>1 or (p->>'raw_edible_g')::numeric<>120 then raise exception 'TESTE litro/mL'; end if;
  perform public.material_command(gen_random_uuid(),'update',current_setting('test.milk')::uuid,'{"name":"TESTE Leite","kind":"ingredient","unit":"l","package_quantity":1,"package_price_cents":1000}');
  p:=public.recipe_preview(current_setting('test.base')::jsonb || jsonb_build_object('components',components));
  if p->>'raw_edible_g' is not null then raise exception 'TESTE mL presumido como g'; end if;
  begin
    perform public.recipe_preview(current_setting('test.base')::jsonb || jsonb_build_object('components',jsonb_build_array(jsonb_build_object('material_id',current_setting('test.milk'),'quantity',100,'unit','g'))));
    raise exception 'TESTE conversão sem densidade';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.recipe_preview(current_setting('test.base')::jsonb || jsonb_build_object('components',jsonb_build_array(jsonb_build_object('material_id',current_setting('test.box'),'quantity',0.5,'unit','un'))));
    raise exception 'TESTE embalagem fracionada';
  exception when invalid_parameter_value then null; end;
  p:=public.recipe_preview(current_setting('test.base')::jsonb || jsonb_build_object('components',jsonb_build_array(jsonb_build_object('material_id',current_setting('test.box'),'quantity',10,'unit','un'))));
  if (p->>'ready')::boolean then raise exception 'TESTE só embalagem precificada'; end if;
end $$;
reset role;
rollback;
select 'Conversões de kg/g, L/mL, densidade, unidade/peso, embalagem excluída do peso e centavos fracionados: aprovados.' as resultado;
