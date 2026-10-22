-- Categorias existentes são preservadas; a chave adicional normaliza espaços internos.
create unique index expense_categories_canonical_name on public.expense_categories(owner_id,lower(regexp_replace(btrim(name),'\s+',' ','g')));
create table public.expenses (
 id uuid primary key,
 owner_id uuid not null references public.business_settings(owner_id) on delete cascade,
 description text not null check(length(btrim(description)) between 1 and 200),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=100000000000),
 category_id uuid,
 occurred_at timestamptz not null check((occurred_at at time zone 'America/Sao_Paulo')>=timestamp '2000-01-01' and (occurred_at at time zone 'America/Sao_Paulo')<timestamp '2100-01-01'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_id,id),
 foreign key(owner_id,category_id) references public.expense_categories(owner_id,id) on delete set null(category_id)
);
create index expenses_owner_date on public.expenses(owner_id,occurred_at desc,id desc);
create index expenses_owner_category_date on public.expenses(owner_id,category_id,occurred_at desc,id desc);
create trigger expenses_updated_at before update on public.expenses for each row execute function private.set_updated_at();
alter table public.expenses enable row level security;
revoke all on public.expenses from public,anon,authenticated;
grant select on public.expenses to authenticated;
create policy expenses_read_own on public.expenses for select to authenticated using(owner_id=(select auth.uid()));
create view public.expense_catalog with(security_invoker=true) as
 select e.id,e.owner_id,e.description,e.amount_cents::text,e.category_id,c.name as category_name,e.occurred_at,e.updated_at
 from public.expenses e left join public.expense_categories c on c.owner_id=e.owner_id and c.id=e.category_id;
revoke all on public.expense_catalog from public,anon,authenticated;
grant select on public.expense_catalog to authenticated;

create function private.business_instant(p_local text) returns timestamptz language plpgsql stable security invoker set search_path='' as $$
declare v_at timestamptz;v_local timestamp;
begin
 if coalesce(p_local,'') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$' then raise exception 'Informe uma data e hora válidas.' using errcode='22023';end if;
 v_local:=p_local::timestamp;
 if v_local<timestamp '2000-01-01' or v_local>=timestamp '2100-01-01' then raise exception 'Use uma data entre 2000 e 2099.' using errcode='22023';end if;
 v_at:=v_local at time zone 'America/Sao_Paulo';
 if v_at at time zone 'America/Sao_Paulo'<>v_local then raise exception 'Este horário não existiu em São Paulo devido ao horário de verão. Confira a hora.' using errcode='22023';end if;
 return v_at;
end;$$;
revoke all on function private.business_instant(text) from public,anon,authenticated;

-- Lista e total do mesmo filtro em um único retrato; limite de 20 linhas por página.
create function public.expense_list(p_from date default null,p_to date default null,p_category text default 'all',p_search text default '',p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_category uuid;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>1000000 or p_category is null or p_search is null or length(p_search)>200 or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Confira os filtros.' using errcode='22023';end if;
 if p_category not in ('all','none') then v_category:=p_category::uuid;end if;
 with filtered as materialized (
  select * from public.expense_catalog where
   (p_from is null or occurred_at>=(p_from::timestamp at time zone 'America/Sao_Paulo')) and
   (p_to is null or occurred_at<((p_to+1)::timestamp at time zone 'America/Sao_Paulo')) and
   (p_category='all' or (p_category='none' and category_id is null) or category_id=v_category) and
   (p_search='' or position(lower(p_search) in lower(description))>0)
 ), page as (select * from filtered order by occurred_at desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.occurred_at desc,p.id desc) from page p),'[]'::jsonb),
 'total',(select count(*) from filtered),'total_cents',(select coalesce(sum(amount_cents::numeric),0)::text from filtered)) into v_result;
 return v_result;
end;$$;
revoke all on function public.expense_list(date,date,text,text,integer) from public,anon,authenticated;
grant execute on function public.expense_list(date,date,text,text,integer) to authenticated;
