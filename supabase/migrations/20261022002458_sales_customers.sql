-- Vendas: valores calculados pelo servidor, com retrato histórico por produto.
create table public.customers (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.business_settings(owner_id) on delete cascade,
 base_name text not null check(length(btrim(base_name)) between 1 and 120),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'), created_at timestamptz not null default now(),
 unique(owner_id,id), unique(owner_id,phone)
);
create table public.sales (
 id uuid primary key, owner_id uuid not null references public.business_settings(owner_id) on delete cascade,
 recipe_id uuid, recipe_source_id uuid not null, product_name text not null check(length(product_name) between 1 and 120),
 customer_id uuid, customer_name text check(length(btrim(customer_name)) between 1 and 120),
 quantity integer not null check(quantity between 1 and 1000000), unit_price_cents bigint not null check(unit_price_cents between 0 and 100000000000),
 unit_cost numeric not null check(unit_cost>=0 and unit_cost<=1e32),
 debit_fee_percent numeric not null check(debit_fee_percent>=0 and debit_fee_percent<100),
 credit_fee_percent numeric not null check(credit_fee_percent>=0 and credit_fee_percent<100),
 payment text not null check(payment in ('cash','pix','debit','credit')),
 applied_fee_percent numeric not null check(applied_fee_percent>=0 and applied_fee_percent<100),
 gross_cents numeric generated always as (quantity::numeric*unit_price_cents) stored,
 production_cents numeric generated always as (round(quantity::numeric*unit_cost*100)) stored,
 fee_cents numeric generated always as (round(quantity::numeric*unit_price_cents*applied_fee_percent/100)) stored,
 occurred_at timestamptz not null check(occurred_at>='2000-01-01Z' and occurred_at<'2100-01-01Z'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((customer_id is null)=(customer_name is null)),
 check(applied_fee_percent=case payment when 'cash' then 0 when 'pix' then 0 when 'debit' then debit_fee_percent else credit_fee_percent end),
 foreign key(owner_id,recipe_id) references public.recipes(owner_id,id) on delete set null(recipe_id),
 foreign key(owner_id,customer_id) references public.customers(owner_id,id) on delete set null(customer_id), unique(owner_id,id)
);
create index sales_owner_date on public.sales(owner_id,occurred_at desc,id desc);
create index sales_owner_customer_date on public.sales(owner_id,customer_id,occurred_at desc,id desc);
create index sales_owner_recipe on public.sales(owner_id,recipe_id);
create trigger sales_updated_at before update on public.sales for each row execute function private.set_updated_at();
create function private.clear_detached_customer() returns trigger language plpgsql security invoker set search_path='' as $$
begin if new.customer_id is null then new.customer_name:=null; end if; return new; end; $$;
revoke all on function private.clear_detached_customer() from public,anon,authenticated;
create trigger sales_clear_customer before update on public.sales for each row execute function private.clear_detached_customer();
alter table public.customers enable row level security;
alter table public.sales enable row level security;
revoke all on public.customers,public.sales from public,anon,authenticated;
grant select on public.customers,public.sales to authenticated;
create policy customers_read_own on public.customers for select to authenticated using(owner_id=(select auth.uid()));
create policy sales_read_own on public.sales for select to authenticated using(owner_id=(select auth.uid()));

create view public.sale_catalog with(security_invoker=true) as select s.id,s.owner_id,s.recipe_id,s.recipe_source_id,s.product_name,s.customer_id,s.customer_name,
 c.phone as customer_phone,s.quantity,s.unit_price_cents::text,s.unit_cost::text,s.debit_fee_percent::text,s.credit_fee_percent::text,s.payment,s.applied_fee_percent::text,
 s.gross_cents::text,s.production_cents::text,s.fee_cents::text,(s.production_cents+s.fee_cents)::text as total_cost_cents,
 (s.gross_cents-s.fee_cents)::text as net_cents,(s.gross_cents-s.production_cents-s.fee_cents)::text as profit_cents,s.occurred_at,s.updated_at
 from public.sales s left join public.customers c on c.owner_id=s.owner_id and c.id=s.customer_id;
create view public.customer_catalog with(security_invoker=true) as
 select c.id,c.owner_id,c.phone,coalesce(last_sale.customer_name,c.base_name) as name,
 totals.items::text,totals.total_cents::text,last_sale.occurred_at as last_purchase,totals.purchases::text
 from public.customers c cross join lateral(select coalesce(sum(s.quantity),0) as items,coalesce(sum(s.gross_cents),0) as total_cents,count(*) as purchases from public.sales s where s.owner_id=c.owner_id and s.customer_id=c.id) totals
 left join lateral(select s.customer_name,s.occurred_at from public.sales s where s.owner_id=c.owner_id and s.customer_id=c.id order by s.occurred_at desc,s.id desc limit 1) last_sale on true;
revoke all on public.sale_catalog,public.customer_catalog from public,anon,authenticated;
grant select on public.sale_catalog,public.customer_catalog to authenticated;

create function private.normalize_phone(input text) returns text language plpgsql immutable security invoker set search_path='' as $$
declare digits text;
begin
 if input is null or input !~ '^\+?[0-9 ().-]+$' or length(input)>40 then raise exception 'Informe um telefone válido com DDD; use + para outro país.' using errcode='22023'; end if;
 digits:=regexp_replace(input,'[^0-9]','','g');
 if left(input,1)<>'+' then
  if length(digits) in (10,11) then digits:='55'||digits;
  elsif not (left(digits,2)='55' and length(digits) in (12,13)) then raise exception 'Informe DDD e telefone ou use + e o código do país.' using errcode='22023'; end if;
 end if;
 if digits !~ '^[1-9][0-9]{7,14}$' or (left(digits,2)='55' and (length(digits) not in (12,13) or substring(digits from 3 for 1)='0')) then raise exception 'Telefone inválido.' using errcode='22023'; end if;
 return '+'||digits;
end; $$;
revoke all on function private.normalize_phone(text) from public,anon,authenticated;

