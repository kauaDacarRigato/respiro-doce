-- Um comando compartilha a serialização e os recibos já usados pelo catálogo.
create or replace function private.commerce_command(command_id uuid,entity text,action text,target_id uuid,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare account_id uuid:=auth.uid(); fingerprint text; previous private.command_receipts%rowtype; calc jsonb; customer uuid; customer_name text; phone text; next_revision bigint; linked_recipe uuid; debit numeric; credit numeric;
begin
 if account_id is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 if command_id is null or target_id is null or coalesce(entity,'') not in ('sale','customer','fees') or coalesce(action,'') not in ('create','update','delete') or data is null or jsonb_typeof(data)<>'object' then raise exception 'Operação inválida.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(account_id::text,0)); perform private.initialize_own_account();
 fingerprint:=encode(extensions.digest(jsonb_build_object('entity',entity,'action',action,'id',target_id,'data',data)::text,'sha256'),'hex');
 select * into previous from private.command_receipts r where r.owner_id=account_id and r.command_id=command_id;
 if found then
  if previous.input_hash<>fingerprint then raise exception 'Tentativa já usada com outros dados.' using errcode='22023'; end if;
  return jsonb_build_object('id',previous.target_id,'status',case when entity='fees' or (entity='sale' and exists(select 1 from public.sales where owner_id=account_id and id=previous.target_id)) or (entity='customer' and exists(select 1 from public.customers where owner_id=account_id and id=previous.target_id)) then 'saved' else 'gone' end);
 end if;
 if entity='fees' then
  if action<>'update' or target_id<>account_id then raise exception 'Operação inválida.' using errcode='42501'; end if;
  debit:=(data->>'debit_fee_percent')::numeric; credit:=(data->>'credit_fee_percent')::numeric;
  if debit is null or credit is null or debit<0 or debit>=100 or credit<0 or credit>=100 or scale(debit)>3 or scale(credit)>3 then raise exception 'Informe taxas de 0 a menos de 100%%, com até 3 casas.' using errcode='22023'; end if;
  update public.business_settings set debit_fee_percent=debit,credit_fee_percent=credit where owner_id=account_id;
 elsif entity='customer' then
  if action<>'delete' then raise exception 'Cadastre o cliente durante uma venda.' using errcode='22023'; end if;
  if not exists(select 1 from public.customers where owner_id=account_id and id=target_id) then raise exception 'Cliente indisponível.' using errcode='P0002'; end if;
  -- O trigger de sales limpa o nome pessoal quando o vínculo é removido.
  delete from public.customers where owner_id=account_id and id=target_id;
 else
  if action in ('update','delete') and not exists(select 1 from public.sales where owner_id=account_id and id=target_id) then raise exception 'Venda indisponível.' using errcode='P0002'; end if;
  if action='delete' then delete from public.sales where owner_id=account_id and id=target_id;
  else
   calc:=private.sale_calculate(case when action='update' then target_id else null end,data);
   if (data->>'quote_signature') is distinct from (calc->>'signature') then raise exception 'Os valores mudaram. Recalcule e confira a venda antes de salvar.' using errcode='P0003'; end if;
   if (calc->>'profit_cents')::numeric<0 and (data->>'confirm_loss') is distinct from 'true' then raise exception 'Confirme o prejuízo antes de salvar.' using errcode='22023'; end if;
   if jsonb_typeof(data->'anonymous') is distinct from 'boolean' then raise exception 'Identifique o cliente ou escolha sem identificação.' using errcode='22023'; end if;
   if (data->>'anonymous')::boolean then customer:=null; customer_name:=null;
   else
    customer_name:=regexp_replace(btrim(data->>'customer_name'),'\s+',' ','g'); phone:=private.normalize_phone(btrim(data->>'customer_phone'));
    if customer_name is null or length(customer_name) not between 1 and 120 then raise exception 'Informe o nome do cliente.' using errcode='22023'; end if;
    customer:=(data->>'customer_id')::uuid;
    if customer is not null then
     if not exists(select 1 from public.customers c where c.owner_id=account_id and c.id=customer and c.phone=phone) then raise exception 'Cliente indisponível. Selecione novamente ou informe um novo telefone.' using errcode='P0002'; end if;
    else
     insert into public.customers(owner_id,base_name,phone) values(account_id,customer_name,phone) on conflict on constraint customers_owner_id_phone_key do nothing;
     select c.id into customer from public.customers c where c.owner_id=account_id and c.phone=phone;
    end if;
   end if;
   select r.id into linked_recipe from public.recipes r where r.owner_id=account_id and r.id=(calc->>'recipe_id')::uuid;
   if action='create' then
    insert into public.sales(id,owner_id,recipe_id,recipe_source_id,product_name,customer_id,customer_name,quantity,unit_price_cents,unit_cost,debit_fee_percent,credit_fee_percent,payment,applied_fee_percent,occurred_at)
    values(target_id,account_id,linked_recipe,(calc->>'recipe_id')::uuid,calc->>'product_name',customer,customer_name,(calc->>'quantity')::integer,(calc->>'unit_price_cents')::bigint,(calc->>'unit_cost')::numeric,(calc->>'debit_fee_percent')::numeric,(calc->>'credit_fee_percent')::numeric,calc->>'payment',(calc->>'applied_fee_percent')::numeric,(calc->>'occurred_at')::timestamptz);
   else
    update public.sales set recipe_id=linked_recipe,recipe_source_id=(calc->>'recipe_id')::uuid,product_name=calc->>'product_name',customer_id=customer,customer_name=customer_name,
     quantity=(calc->>'quantity')::integer,unit_price_cents=(calc->>'unit_price_cents')::bigint,unit_cost=(calc->>'unit_cost')::numeric,debit_fee_percent=(calc->>'debit_fee_percent')::numeric,credit_fee_percent=(calc->>'credit_fee_percent')::numeric,
     payment=calc->>'payment',applied_fee_percent=(calc->>'applied_fee_percent')::numeric,occurred_at=(calc->>'occurred_at')::timestamptz where owner_id=account_id and id=target_id;
   end if;
  end if;
 end if;
 insert into private.command_receipts(owner_id,command_id,input_hash,target_id) values(account_id,command_id,fingerprint,target_id);
 insert into public.account_sync_state(owner_id,revision) values(account_id,1) on conflict(owner_id) do update set revision=public.account_sync_state.revision+1 returning revision into next_revision;
 perform realtime.send(jsonb_build_object('revision',next_revision),'changed','account:'||account_id::text,true);
 return jsonb_build_object('id',target_id,'status',case when action='delete' then 'gone' else 'saved' end);
end; $$;
