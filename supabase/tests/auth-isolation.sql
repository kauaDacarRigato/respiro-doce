-- Exercita os papéis reais do Postgres. Todos os dados fictícios são revertidos.
begin;
select set_config('test.owner_a', gen_random_uuid()::text, true);
select set_config('test.owner_b', gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.owner_a')::uuid, 'TESTE-etapa4-a@example.invalid'),
  (current_setting('test.owner_b')::uuid, 'TESTE-etapa4-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.owner_a'), true);
select public.initialize_account();
select public.initialize_account();
do $$ begin
  if (select count(*) from public.business_settings) <> 1 then raise exception 'TESTE: bootstrap A'; end if;
  if (select count(*) from public.expense_categories) <> 8 then raise exception 'TESTE: categorias duplicadas'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.owner_b'), true);
do $$ begin
  if exists (select 1 from public.business_settings) then raise exception 'TESTE: B leu A'; end if;
  if exists (select 1 from public.expense_categories) then raise exception 'TESTE: B leu categorias A'; end if;
  begin
    perform public.commerce_command(gen_random_uuid(),'fees','update',current_setting('test.owner_a')::uuid,'{"debit_fee_percent":20,"credit_fee_percent":0}');
    raise exception 'TESTE: B alterou A';
  exception when insufficient_privilege then null; end;
end $$;
select public.initialize_account();
select public.commerce_command(gen_random_uuid(),'fees','update',current_setting('test.owner_b')::uuid,'{"debit_fee_percent":2.5,"credit_fee_percent":0}');
do $$ begin
  if (select count(*) from public.business_settings) <> 1 then raise exception 'TESTE: isolamento B'; end if;
  if (select count(*) from public.expense_categories) <> 8 then raise exception 'TESTE: categorias B'; end if;
  if (select debit_fee_percent from public.business_settings) <> 2.5 then raise exception 'TESTE: edição própria'; end if;
  begin
    perform public.commerce_command(gen_random_uuid(),'fees','update',current_setting('test.owner_b')::uuid,'{"debit_fee_percent":2.5,"credit_fee_percent":100}');
    raise exception 'TESTE: taxa inválida aceita';
  exception when invalid_parameter_value then null; end;
  begin
    update public.business_settings set owner_id = current_setting('test.owner_a')::uuid;
    raise exception 'TESTE: dono alterado';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.expense_categories(owner_id,name) values(current_setting('test.owner_a')::uuid,'TESTE cruzado');
    raise exception 'TESTE: escrita direta indevida';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.owner_a'), true);
do $$ begin
  if (select debit_fee_percent from public.business_settings) <> 0 then raise exception 'TESTE: A foi modificado'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.business_settings;
    raise exception 'TESTE: leitura anônima';
  exception when insufficient_privilege then null; end;
  begin
    perform public.initialize_account();
    raise exception 'TESTE: bootstrap anônimo';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Isolamento, edição própria, validação e bloqueio anônimo: aprovados; dados de teste revertidos.' as resultado;
