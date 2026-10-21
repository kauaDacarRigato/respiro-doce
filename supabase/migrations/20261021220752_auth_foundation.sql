-- Fundação da conta. Os módulos de negócio serão adicionados nas próximas migrações.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.business_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  debit_fee_percent numeric(6,3) not null default 0 check (debit_fee_percent >= 0 and debit_fee_percent < 100),
  credit_fee_percent numeric(6,3) not null default 0 check (credit_fee_percent >= 0 and credit_fee_percent < 100),
  opening_balance_cents bigint not null default 0,
  opening_balance_at timestamptz not null default now(),
  currency text not null default 'BRL' check (currency = 'BRL'),
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.business_settings(owner_id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  normalized_name text generated always as (lower(btrim(name))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, normalized_name),
  unique (owner_id, id)
);

alter table public.business_settings enable row level security;
alter table public.expense_categories enable row level security;
revoke all on public.business_settings, public.expense_categories from public, anon, authenticated;
grant select on public.business_settings, public.expense_categories to authenticated;
grant update (debit_fee_percent, credit_fee_percent, opening_balance_cents, opening_balance_at)
  on public.business_settings to authenticated;

create policy settings_read_own on public.business_settings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy settings_update_own on public.business_settings
  for update to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy categories_read_own on public.expense_categories
  for select to authenticated using (owner_id = (select auth.uid()));

create function private.set_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;
create trigger settings_updated_at before update on public.business_settings
  for each row execute function private.set_updated_at();
create trigger categories_updated_at before update on public.expense_categories
  for each row execute function private.set_updated_at();

-- Privilégio restrito ao bootstrap da própria identidade, nunca recebe owner_id do cliente.
create function private.initialize_own_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := auth.uid();
  created boolean;
begin
  if account_id is null then
    raise exception 'Autenticação necessária' using errcode = '42501';
  end if;
  insert into public.business_settings (owner_id) values (account_id)
    on conflict (owner_id) do nothing;
  created := found;
  if created then
    insert into public.expense_categories (owner_id, name)
      select account_id, category from unnest(array[
        'Embalagens', 'Ingredientes', 'Frutas', 'Laticínios',
        'Gás e energia', 'Transporte', 'Marketing', 'Outros'
      ]) as category;
  end if;
end;
$$;
revoke all on function private.initialize_own_account() from public, anon, authenticated;
grant execute on function private.initialize_own_account() to authenticated;

create function public.initialize_account() returns void
language sql security invoker set search_path = ''
as 'select private.initialize_own_account()';
revoke all on function public.initialize_account() from public, anon, authenticated;
grant execute on function public.initialize_account() to authenticated;
