create function private.sale_calculate(sale_id uuid,data jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
#variable_conflict use_variable
declare account_id uuid:=auth.uid(); old public.sales%rowtype; product public.recipes%rowtype; settings public.business_settings%rowtype;
 target uuid; same_product boolean; pricing jsonb; cost numeric; debit numeric; credit numeric; rate numeric; product_name text;
 qty numeric; price numeric; gross numeric; production numeric; fee numeric; at_time timestamptz; result jsonb;
begin
 if account_id is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
 if data is null or jsonb_typeof(data)<>'object' then raise exception 'Venda inválida.' using errcode='22023'; end if;
 if sale_id is not null then
  select * into old from public.sales where owner_id=account_id and id=sale_id;
  if not found then raise exception 'Venda indisponível. Atualize a lista.' using errcode='P0002'; end if;
 end if;
 target:=(data->>'recipe_id')::uuid;
 same_product:=old.id is not null and target=old.recipe_source_id;
 if same_product then cost:=old.unit_cost; debit:=old.debit_fee_percent; credit:=old.credit_fee_percent; product_name:=old.product_name;
 else
  if old.id is not null and (data->>'confirm_product_change') is distinct from 'true' then raise exception 'Confirme a troca de produto e a atualização dos custos.' using errcode='22023'; end if;
  select * into product from public.recipes where owner_id=account_id and id=target;
  if not found then raise exception 'Produto indisponível. Escolha uma receita da sua conta.' using errcode='P0002'; end if;
  select r.pricing into pricing from public.recipe_catalog r where r.owner_id=account_id and r.id=target;
  if (pricing->>'ready')::boolean is distinct from true then raise exception 'Conclua a receita antes de vendê-la.' using errcode='22023'; end if;
  cost:=(pricing->>'unit_cost')::numeric; product_name:=product.name;
  select * into settings from public.business_settings where owner_id=account_id;
  debit:=settings.debit_fee_percent; credit:=settings.credit_fee_percent;
 end if;
 qty:=(data->>'quantity')::numeric; price:=(data->>'unit_price_cents')::numeric;
 if qty is null or qty<1 or qty>1000000 or qty<>trunc(qty) or price is null or price<0 or price>100000000000 or price<>trunc(price) or coalesce(data->>'payment','') not in ('cash','pix','debit','credit') or cost>1e32 then raise exception 'Confira quantidade, preço e pagamento.' using errcode='22023'; end if;
 if coalesce(data->>'occurred_local','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then raise exception 'Data inválida.' using errcode='22023'; end if;
 at_time:=(data->>'occurred_local')::timestamp at time zone 'America/Sao_Paulo';
 if at_time<'2000-01-01Z' or at_time>='2100-01-01Z' then raise exception 'Use uma data entre 2000 e 2099.' using errcode='22023'; end if;
 rate:=case data->>'payment' when 'cash' then 0 when 'pix' then 0 when 'debit' then debit else credit end;
 gross:=qty*price; production:=round(qty*cost*100); fee:=round(gross*rate/100);
 result:=jsonb_build_object('product_name',product_name,'recipe_id',target,'historical',same_product,'quantity',qty,'unit_price_cents',price::text,'unit_cost',cost::text,
  'debit_fee_percent',debit::text,'credit_fee_percent',credit::text,'applied_fee_percent',rate::text,'payment',data->>'payment','occurred_at',at_time,
  'gross_cents',gross::text,'production_cents',production::text,'fee_cents',fee::text,'total_cost_cents',(production+fee)::text,'profit_cents',(gross-production-fee)::text,'net_cents',(gross-fee)::text);
 return result || jsonb_build_object('signature',encode(extensions.digest(result::text,'sha256'),'hex'));
end; $$;
revoke all on function private.sale_calculate(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.sale_calculate(uuid,jsonb) to authenticated;
create function public.sale_preview(p_sale_id uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as 'select private.sale_calculate(p_sale_id,p_data)';
revoke all on function public.sale_preview(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.sale_preview(uuid,jsonb) to authenticated;

