begin;
select set_config('test.a',gen_random_uuid()::text,true);
select set_config('test.b',gen_random_uuid()::text,true);
select set_config('test.category',gen_random_uuid()::text,true);
select set_config('test.expense',gen_random_uuid()::text,true);
select set_config('test.ckey',gen_random_uuid()::text,true);
select set_config('test.ekey',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.a')::uuid,'TESTE-expenses-a@example.invalid'),(current_setting('test.b')::uuid,'TESTE-expenses-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.a'),true);
select public.expense_command(current_setting('test.ckey')::uuid,'expense_category','create',current_setting('test.category')::uuid,'{"name":" TESTE   Despesas "}');
select set_config('test.payload',jsonb_build_object('description','TESTE 100% gás','amount_cents',12345,'category_id',current_setting('test.category'),'occurred_local','2026-10-20T23:59:59')::text,true);
select public.expense_command(current_setting('test.ekey')::uuid,'expense','create',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb);
select public.expense_command(current_setting('test.ekey')::uuid,'expense','create',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb);
do $$ declare r jsonb; v_revision bigint;begin
 select revision into v_revision from public.account_sync_state;
 -- Two stale editors: the last completed command wins, without merging fields.
 perform public.expense_command(gen_random_uuid(),'expense','update',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb||'{"description":"TESTE Editor A","amount_cents":500}');
 perform public.expense_command(gen_random_uuid(),'expense','update',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb||'{"description":"TESTE Editor B","amount_cents":700}');
 if not exists(select 1 from public.expenses where id=current_setting('test.expense')::uuid and description='TESTE Editor B' and amount_cents=700) then raise exception 'TESTE última gravação';end if;
 if (select revision from public.account_sync_state)<>v_revision+2 then raise exception 'TESTE revisão de edições';end if;
 -- Retrying an earlier command cannot restore the old value or add a revision.
 perform public.expense_command(current_setting('test.ekey')::uuid,'expense','create',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb);
 if (select revision from public.account_sync_state)<>v_revision+2 or (select amount_cents from public.expenses)<>700 then raise exception 'TESTE repetição reverteu edição';end if;
 begin perform public.material_command(current_setting('test.ekey')::uuid,'delete',current_setting('test.expense')::uuid,'{}');raise exception 'TESTE chave entre módulos';exception when invalid_parameter_value then null;end;
 -- Stale references are rejected atomically, and failed writes emit no revision.
 perform public.expense_command(gen_random_uuid(),'expense_category','delete',current_setting('test.category')::uuid,'{}');
 select revision into v_revision from public.account_sync_state;
 begin perform public.expense_command(gen_random_uuid(),'expense','update',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb);raise exception 'TESTE referência removida';exception when no_data_found then null;end;
 if (select revision from public.account_sync_state)<>v_revision or (select amount_cents from public.expenses)<>700 then raise exception 'TESTE escrita parcial';end if;
 perform public.expense_command(gen_random_uuid(),'expense','delete',current_setting('test.expense')::uuid,'{}');
 select revision into v_revision from public.account_sync_state;
 r:=public.expense_command(current_setting('test.ekey')::uuid,'expense','create',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb);
 if r->>'status'<>'gone' or (select revision from public.account_sync_state)<>v_revision then raise exception 'TESTE exclusão ressuscitada';end if;
 begin perform public.expense_command(gen_random_uuid(),'expense','update',current_setting('test.expense')::uuid,current_setting('test.payload')::jsonb);raise exception 'TESTE edição tardia';exception when no_data_found then null;end;
 if public.cash_list()->>'closing_cents'<>'0' or public.financial_report('year','2026-01-01')->'summary'->>'expense_cents'<>'0' then raise exception 'TESTE agregados após exclusão';end if;
 begin update public.account_sync_state set revision=999;raise exception 'TESTE revisão forjada';exception when insufficient_privilege then null;end;
 begin perform * from private.command_receipts;raise exception 'TESTE recibo exposto';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.b'),true);
select public.initialize_account();
do $$ begin
 if exists(select 1 from public.account_sync_state where owner_id=current_setting('test.a')::uuid) then raise exception 'TESTE revisão de outra conta';end if;
 if exists(select 1 from public.expense_categories where id=current_setting('test.category')::uuid) then raise exception 'TESTE referência de outra conta';end if;
end $$;
reset role;rollback;
select 'Sincronização: última gravação, repetição sem regressão/revisão extra, atomicidade, referências excluídas, não recriação e isolamento de revisões aprovados. Testes revertidos.' as resultado;
