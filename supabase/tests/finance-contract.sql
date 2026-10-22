begin;
select set_config('test.a',gen_random_uuid()::text,true);
select set_config('test.b',gen_random_uuid()::text,true);
select set_config('test.m',gen_random_uuid()::text,true);
select set_config('test.r',gen_random_uuid()::text,true);
select set_config('test.s',gen_random_uuid()::text,true);
select set_config('test.e',gen_random_uuid()::text,true);
select set_config('test.key',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.a')::uuid,'TESTE-finance-a@example.invalid'),(current_setting('test.b')::uuid,'TESTE-finance-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
select public.initialize_account();
select public.opening_balance_command(current_setting('test.key')::uuid,'{"amount_cents":10000,"occurred_local":"2026-09-30T23:59:59","confirm":true}');
select public.commerce_command(gen_random_uuid(),'fees','update',current_setting('test.a')::uuid,'{"debit_fee_percent":2,"credit_fee_percent":5.49}');
select public.material_command(gen_random_uuid(),'create',current_setting('test.m')::uuid,'{"name":"TESTE Cacau","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":3072}');
select public.recipe_command(gen_random_uuid(),'create',current_setting('test.r')::uuid,jsonb_build_object('name','TESTE Brigadeiro','yield_units',5,'indirect_percent',25,'fee_percent',5.49,'final_quantity',500,'final_unit','g','serving_unit','g','components',jsonb_build_array(jsonb_build_object('material_id',current_setting('test.m'),'quantity',500,'unit','g'))));
select set_config('test.base',jsonb_build_object('recipe_id',current_setting('test.r'),'quantity',1,'unit_price_cents',1000,'payment','credit','occurred_local','2026-10-20T23:59:59','anonymous',true)::text,true);
select public.commerce_command(gen_random_uuid(),'sale','create',current_setting('test.s')::uuid,current_setting('test.base')::jsonb||jsonb_build_object('quote_signature',public.sale_preview(null,current_setting('test.base')::jsonb)->>'signature'));
select public.expense_command(gen_random_uuid(),'expense','create',current_setting('test.e')::uuid,'{"description":"TESTE Gás","amount_cents":200,"occurred_local":"2026-10-21T00:00:00","category_id":null}');
do $$ declare r jsonb;s jsonb;i integer;d jsonb;q jsonb;v_key uuid:=gen_random_uuid();begin
 r:=public.cash_list('2026-10-01','2026-10-31');
 if r->>'previous_cents'<>'10000' or r->>'incoming_cents'<>'945' or r->>'expenses_cents'<>'200' or r->>'opening_cents'<>'0' or r->>'closing_cents'<>'10745' then raise exception 'TESTE conciliação %',r;end if;
 r:=public.cash_list('2026-10-21','2026-10-21','expense','none');
 if r->>'previous_cents'<>'10945' or r->'items'->0->>'balance_cents'<>'10745' or r->>'closing_cents'<>'10745' then raise exception 'TESTE saldo filtrado %',r;end if;
 r:=public.financial_report('month','2026-10-20');s:=r->'summary';
 if s->>'gross_cents'<>'1000' or s->>'production_cents'<>'384' or s->>'fee_cents'<>'55' or s->>'product_profit_cents'<>'561' or s->>'cash_flow_cents'<>'745' or s->>'expense_cents'<>'200' or s->>'sales'<>'1' then raise exception 'TESTE resumo %',r;end if;
 if jsonb_array_length(r->'buckets')<>31 or r->'buckets'->0->'metrics'->>'gross_cents'<>'0' or r->'buckets'->19->'metrics'->>'gross_cents'<>'1000' or r->'buckets'->20->'metrics'->>'expense_cents'<>'200' then raise exception 'TESTE intervalos/datas %',r;end if;
 if r->'products'->0->'metrics'->>'product_profit_cents'<>'561' then raise exception 'TESTE produto';end if;
 if jsonb_array_length(public.financial_report('month','2024-02-15')->'buckets')<>29 or jsonb_array_length(public.financial_report('year','2026-10-15')->'buckets')<>12 or jsonb_array_length(public.financial_report('day','2026-10-20')->'buckets')<>24 then raise exception 'TESTE lacunas/calendário';end if;
 -- Alterar custo e excluir receita não muda valores históricos do relatório.
 perform public.material_command(gen_random_uuid(),'update',current_setting('test.m')::uuid,'{"name":"TESTE Cacau","kind":"ingredient","unit":"kg","package_quantity":1,"package_price_cents":6144}');
 perform public.recipe_command(gen_random_uuid(),'delete',current_setting('test.r')::uuid,'{}');
 r:=public.financial_report('year','2026-01-01');if r->'summary'->>'production_cents'<>'384' or r->'products'->0->>'id'<>current_setting('test.r') then raise exception 'TESTE histórico';end if;
 -- Edição/exclusão refletem-se em ambos os relatórios, sem custo duplicado no caixa.
 d:=current_setting('test.base')::jsonb||'{"quantity":2}';q:=public.sale_preview(current_setting('test.s')::uuid,d);
 perform public.commerce_command(gen_random_uuid(),'sale','update',current_setting('test.s')::uuid,d||jsonb_build_object('quote_signature',q->>'signature'));
 r:=public.cash_list('2026-10-01','2026-10-31');if r->>'closing_cents'<>'11690' then raise exception 'TESTE edição';end if;
 perform public.expense_command(gen_random_uuid(),'expense','delete',current_setting('test.e')::uuid,'{}');
 r:=public.financial_report('month','2026-10-01');if r->'summary'->>'cash_flow_cents'<>'1890' or r->'summary'->>'product_profit_cents'<>'1122' then raise exception 'TESTE exclusão/edição';end if;
 -- Uma única base; repetir comando antigo não sobrescreve uma alteração posterior.
 perform public.opening_balance_command(v_key,'{"amount_cents":-5000,"occurred_local":"2026-10-01T00:00:00","confirm":true}');
 perform public.opening_balance_command(current_setting('test.key')::uuid,'{"amount_cents":10000,"occurred_local":"2026-09-30T23:59:59","confirm":true}');
 if public.opening_balance()->>'amount_cents'<>'-5000' then raise exception 'TESTE repetição sobrescreveu base';end if;
 r:=public.cash_list();if r->>'closing_cents'<>'-3110' or (r->>'total')::integer<>2 then raise exception 'TESTE saldo inicial duplicado';end if;
 r:=public.financial_report('month','2026-10-01');if r->'summary'->>'cash_flow_cents'<>'1890' then raise exception 'TESTE base entrou no resumo';end if;
 begin perform public.opening_balance_command(gen_random_uuid(),'{"amount_cents":100,"occurred_local":"2026-10-01T00:00:00","confirm":false}');raise exception 'TESTE sem confirmação';exception when invalid_parameter_value then null;end;
 begin perform public.opening_balance_command(gen_random_uuid(),'{"amount_cents":1.5,"occurred_local":"2026-10-01T00:00:00","confirm":true}');raise exception 'TESTE fração';exception when invalid_parameter_value then null;end;
 begin perform public.opening_balance_command(v_key,'{}');raise exception 'TESTE chave diferente';exception when invalid_parameter_value then null;end;
 begin update public.business_settings set opening_balance_cents=1;raise exception 'TESTE escrita direta';exception when insufficient_privilege then null;end;
 -- Mais de uma página com data igual: ordem e saldo estáveis em todas as páginas.
 for i in 1..21 loop perform public.expense_command(gen_random_uuid(),'expense','create',gen_random_uuid(),jsonb_build_object('description','TESTE Página '||i,'amount_cents',100,'occurred_local','2026-10-22T12:00:00','category_id',null));end loop;
 r:=public.cash_list(null,null,'expense','all',0);s:=public.cash_list(null,null,'expense','all',1);
 if jsonb_array_length(r->'items')<>20 or jsonb_array_length(s->'items')<>1 or r->>'closing_cents'<>'-5210' or s->>'closing_cents'<>'-5210' then raise exception 'TESTE página';end if;
 if r->'items'->0->>'balance_cents'<>'-5210' or s->'items'->0->>'balance_cents'<>'-3210' or (r->'items'->19->>'id')<=(s->'items'->0->>'id') then raise exception 'TESTE ordem/saldo';end if;
 perform public.opening_balance_command(gen_random_uuid(),'{"amount_cents":0,"occurred_local":"2026-10-01T00:00:00","confirm":true}');
 if exists(select 1 from public.cash_entries where kind='opening') then raise exception 'TESTE base zero';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
select public.initialize_account();
do $$ begin
 if public.cash_list()->>'total'<>'0' or public.financial_report('year','2026-01-01')->'summary'->>'gross_cents'<>'0' or exists(select 1 from public.cash_entries) then raise exception 'TESTE leitura cruzada';end if;
 perform public.opening_balance_command(gen_random_uuid(),'{"amount_cents":50,"occurred_local":"2026-10-01T00:00:00","confirm":true}');
 if public.cash_list()->>'closing_cents'<>'50' then raise exception 'TESTE base própria';end if;
end $$;
reset role;set local role anon;
do $$ begin
 begin perform public.cash_list();raise exception 'TESTE caixa anônimo';exception when insufficient_privilege then null;end;
 begin perform public.financial_report('month','2026-10-01');raise exception 'TESTE resumo anônimo';exception when insufficient_privilege then null;end;
 begin perform public.opening_balance();raise exception 'TESTE base anônima';exception when insufficient_privilege then null;end;
end $$;
reset role;rollback;
select 'Caixa/resumos: conciliação, filtros, histórico, calendário, paginação, base única, idempotência e isolamento aprovados. Testes revertidos.' as resultado;
