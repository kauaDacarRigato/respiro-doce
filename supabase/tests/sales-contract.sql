begin;
select set_config('test.a',gen_random_uuid()::text,true);
select set_config('test.b',gen_random_uuid()::text,true);
select set_config('test.m',gen_random_uuid()::text,true);
select set_config('test.r',gen_random_uuid()::text,true);
select set_config('test.s',gen_random_uuid()::text,true);
select set_config('test.key',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.a')::uuid,'TESTE-sales-a@example.invalid'),(current_setting('test.b')::uuid,'TESTE-sales-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
select public.initialize_account();
select public.commerce_command(gen_random_uuid(),'fees','update',current_setting('test.a')::uuid,'{"debit_fee_percent":2,"credit_fee_percent":5.49}');
select public.material_command(gen_random_uuid(),'create',current_setting('test.m')::uuid,'{"name":"TESTE Cacau","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":3072}');
select public.recipe_command(gen_random_uuid(),'create',current_setting('test.r')::uuid,jsonb_build_object('name','TESTE Brigadeiro','yield_units',5,'indirect_percent',25,'fee_percent',5.49,'final_quantity',500,'final_unit','g','serving_unit','g','components',jsonb_build_array(jsonb_build_object('material_id',current_setting('test.m'),'quantity',500,'unit','g'))));
select set_config('test.base',jsonb_build_object('recipe_id',current_setting('test.r'),'quantity',1,'unit_price_cents',1000,'payment','credit','occurred_local','2026-10-20T23:59:59','anonymous',false,'customer_name','TESTE Antigo','customer_phone','(11) 99999-9999')::text,true);
select set_config('test.payload',(current_setting('test.base')::jsonb||jsonb_build_object('quote_signature',public.sale_preview(null,current_setting('test.base')::jsonb)->>'signature'))::text,true);
select public.commerce_command(current_setting('test.key')::uuid,'sale','create',current_setting('test.s')::uuid,current_setting('test.payload')::jsonb);
select public.commerce_command(current_setting('test.key')::uuid,'sale','create',current_setting('test.s')::uuid,current_setting('test.payload')::jsonb);
do $$ declare q jsonb; d jsonb; c uuid; s2 uuid:=gen_random_uuid(); begin
 if (select count(*) from public.sales)<>1 then raise exception 'TESTE duplicação'; end if;
 if not exists(select 1 from public.sales where gross_cents=1000 and production_cents=384 and fee_cents=55) then raise exception 'TESTE fórmula'; end if;
 if not exists(select 1 from public.sale_catalog where profit_cents='561' and net_cents='945') then raise exception 'TESTE lucro/líquido'; end if;
 if not exists(select 1 from public.customer_catalog where phone='+5511999999999' and items='1' and total_cents='1000') then raise exception 'TESTE cliente'; end if;
 if (select count(*) from public.sales_period('2026-10-20','2026-10-20'))<>1 or exists(select 1 from public.sales_period('2026-10-21','2026-10-21')) then raise exception 'TESTE fuso/datas'; end if;
 -- Outra compra com o mesmo telefone, grafia diferente e data posterior.
 d:=current_setting('test.base')::jsonb||'{"customer_name":"TESTE Recente","customer_phone":"+5511999999999","occurred_local":"2026-10-21T00:00:00","payment":"pix"}';
 q:=public.sale_preview(null,d);perform public.commerce_command(gen_random_uuid(),'sale','create',s2,d||jsonb_build_object('quote_signature',q->>'signature'));
 if (select count(*) from public.customers)<>1 or not exists(select 1 from public.customer_catalog where name='TESTE Recente' and items='2' and total_cents='2000') then raise exception 'TESTE deduplicação/nome'; end if;
 if not exists(select 1 from public.sales where id=s2 and fee_cents=0) then raise exception 'TESTE Pix'; end if;
 perform public.commerce_command(gen_random_uuid(),'sale','delete',s2,'{}');
 if (select name from public.customer_catalog)<>'TESTE Antigo' then raise exception 'TESTE nome após excluir última'; end if;
 -- Preço e taxas atuais mudam, sem reescrever venda antiga.
 perform public.material_command(gen_random_uuid(),'update',current_setting('test.m')::uuid,'{"name":"TESTE Cacau","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":6144}');
 perform public.commerce_command(gen_random_uuid(),'fees','update',current_setting('test.a')::uuid,'{"debit_fee_percent":10,"credit_fee_percent":20}');
 d:=current_setting('test.base')::jsonb||'{"quantity":2}';q:=public.sale_preview(current_setting('test.s')::uuid,d);
 if (q->>'production_cents')::numeric<>768 or (q->>'fee_cents')::numeric<>110 then raise exception 'TESTE histórico %',q; end if;
 perform public.commerce_command(gen_random_uuid(),'sale','update',current_setting('test.s')::uuid,d||jsonb_build_object('quote_signature',q->>'signature'));
 d:=d||'{"payment":"cash"}';q:=public.sale_preview(current_setting('test.s')::uuid,d);
 if q->>'fee_cents'<>'0' or q->>'profit_cents'<>'1232' then raise exception 'TESTE dinheiro'; end if;
 perform public.commerce_command(gen_random_uuid(),'sale','update',current_setting('test.s')::uuid,d||jsonb_build_object('quote_signature',q->>'signature'));
 -- Resposta antiga da prévia não pode salvar custos diferentes sem revisão.
 d:=current_setting('test.base')::jsonb;q:=public.sale_preview(null,d);
 perform public.commerce_command(gen_random_uuid(),'fees','update',current_setting('test.a')::uuid,'{"debit_fee_percent":11,"credit_fee_percent":21}');
 begin perform public.commerce_command(gen_random_uuid(),'sale','create',gen_random_uuid(),d||jsonb_build_object('quote_signature',q->>'signature'));raise exception 'TESTE prévia antiga aceita'; exception when sqlstate 'P0003' then null;end;
 -- Prejuízo/gratuidade exige confirmação; falha não deixa cliente parcial.
 d:=current_setting('test.base')::jsonb||'{"unit_price_cents":0,"customer_phone":"(11) 98888-8888"}';q:=public.sale_preview(null,d);
 begin perform public.commerce_command(gen_random_uuid(),'sale','create',gen_random_uuid(),d||jsonb_build_object('quote_signature',q->>'signature'));raise exception 'TESTE prejuízo sem confirmação';exception when invalid_parameter_value then null;end;
 if (select count(*) from public.customers)<>1 then raise exception 'TESTE cliente parcial';end if;
 -- Receita excluída preserva venda; ainda é possível ajustar quantidade/preço.
 perform public.recipe_command(gen_random_uuid(),'delete',current_setting('test.r')::uuid,'{}');
 if not exists(select 1 from public.sales where recipe_id is null and unit_cost=3.84 and quantity=2) then raise exception 'TESTE receita excluída alterou histórico'; end if;
 q:=public.sale_preview(current_setting('test.s')::uuid,current_setting('test.base')::jsonb);
 if q->>'unit_cost'<>'3.8400000000000000000000000000000000000000' and (q->>'unit_cost')::numeric<>3.84 then raise exception 'TESTE editar histórico sem receita';end if;
 -- Excluir cliente apaga nome e telefone das vendas, mantendo valores.
 select id into c from public.customers;perform public.commerce_command(gen_random_uuid(),'customer','delete',c,'{}');
 if exists(select 1 from public.sale_catalog where customer_id is not null or customer_name is not null or customer_phone is not null) then raise exception 'TESTE dados pessoais retidos';end if;
 if not exists(select 1 from public.sale_catalog where gross_cents='2000' and production_cents='768') then raise exception 'TESTE valores perdidos';end if;
 begin update public.sales set quantity=99;raise exception 'TESTE escrita direta';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
select public.initialize_account();
do $$ begin
 if exists(select 1 from public.sale_catalog) or exists(select 1 from public.customers) then raise exception 'TESTE vazamento';end if;
 begin perform public.commerce_command(gen_random_uuid(),'sale','delete',current_setting('test.s')::uuid,'{}');raise exception 'TESTE exclusão cruzada';exception when no_data_found then null;end;
 begin perform public.sale_preview(current_setting('test.s')::uuid,current_setting('test.base')::jsonb);raise exception 'TESTE prévia cruzada';exception when no_data_found then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
select public.commerce_command(gen_random_uuid(),'sale','delete',current_setting('test.s')::uuid,'{}');
do $$ declare r jsonb;begin
 r:=public.commerce_command(current_setting('test.key')::uuid,'sale','create',current_setting('test.s')::uuid,current_setting('test.payload')::jsonb);
 if r->>'status'<>'gone' or exists(select 1 from public.sales) then raise exception 'TESTE recriação';end if;
 begin perform public.commerce_command(gen_random_uuid(),'sale','update',current_setting('test.s')::uuid,current_setting('test.payload')::jsonb);raise exception 'TESTE edição ressuscitou';exception when no_data_found then null;end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform * from public.sale_catalog;raise exception 'TESTE leitura anônima';exception when insufficient_privilege then null;end;begin perform public.sale_preview(null,'{}');raise exception 'TESTE cálculo anônimo';exception when insufficient_privilege then null;end;end $$;
reset role;rollback;
select 'Vendas: fórmulas, histórico, clientes, privacidade, datas, atomicidade, RLS e idempotência aprovados. Testes revertidos.' as resultado;
