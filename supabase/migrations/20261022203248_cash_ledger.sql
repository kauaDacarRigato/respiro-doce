-- Fonte comum do caixa e dos resumos. Nenhum saldo incremental é persistido.
create view public.cash_entries with(security_invoker=true) as
 select s.owner_id,s.id,'sale'::text as kind,1 as source_order,s.occurred_at,s.product_name as description,
 null::uuid as category_id,null::text as category_name,s.recipe_source_id as product_id,s.quantity::numeric as items,
 s.gross_cents,s.production_cents,s.fee_cents,0::numeric as expense_cents,(s.gross_cents-s.fee_cents) as delta_cents
 from public.sales s
 union all
 select e.owner_id,e.id,'expense',2,e.occurred_at,e.description,e.category_id,c.name,null::uuid,0::numeric,
 0::numeric,0::numeric,0::numeric,e.amount_cents::numeric,-e.amount_cents::numeric
 from public.expenses e left join public.expense_categories c on c.owner_id=e.owner_id and c.id=e.category_id
 union all
 select b.owner_id,b.owner_id,'opening',0,b.opening_balance_at,'Saldo inicial',null::uuid,null::text,null::uuid,0::numeric,
 0::numeric,0::numeric,0::numeric,0::numeric,b.opening_balance_cents::numeric
 from public.business_settings b where b.opening_balance_cents<>0;
revoke all on public.cash_entries from public,anon,authenticated;
grant select on public.cash_entries to authenticated;

create function public.cash_list(p_from date default null,p_to date default null,p_kind text default 'all',p_category text default 'all',p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_from timestamptz;v_to timestamptz;v_category uuid;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 if p_page is null or p_page<0 or p_page>1000000 or coalesce(p_kind,'') not in ('all','sale','expense','opening') or p_category is null or (p_from is not null and p_to is not null and p_from>p_to) then raise exception 'Confira os filtros do caixa.' using errcode='22023';end if;
 v_from:=p_from::timestamp at time zone 'America/Sao_Paulo';v_to:=(p_to+1)::timestamp at time zone 'America/Sao_Paulo';
 if p_category not in ('all','none') then v_category:=p_category::uuid;end if;
 with entries as materialized(select * from public.cash_entries),
 running as (select e.*,sum(delta_cents) over(order by occurred_at,source_order,id rows between unbounded preceding and current row) as balance_cents from entries e),
 period as materialized(select * from running where (v_from is null or occurred_at>=v_from) and (v_to is null or occurred_at<v_to)),
 filtered as materialized(select * from period where (p_kind='all' or kind=p_kind) and (p_category='all' or (kind='expense' and ((p_category='none' and category_id is null) or category_id=v_category)))),
 page as (select * from filtered order by occurred_at desc,source_order desc,id desc limit 20 offset p_page*20)
 select jsonb_build_object(
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'description',description,'occurred_at',occurred_at,'category_name',category_name,'delta_cents',delta_cents::text,'balance_cents',balance_cents::text,'gross_cents',gross_cents::text,'fee_cents',fee_cents::text) order by occurred_at desc,source_order desc,id desc) from page),'[]'::jsonb),
 'total',(select count(*) from filtered),
 'previous_cents',(select coalesce(sum(delta_cents),0)::text from entries where v_from is not null and occurred_at<v_from),
 'incoming_cents',(select coalesce(sum(delta_cents),0)::text from period where kind='sale'),
 'expenses_cents',(select coalesce(sum(expense_cents),0)::text from period where kind='expense'),
 'opening_cents',(select coalesce(sum(delta_cents),0)::text from period where kind='opening'),
 'closing_cents',(select coalesce(sum(delta_cents),0)::text from entries where v_to is null or occurred_at<v_to),
 'current_cents',(select coalesce(sum(delta_cents),0)::text from entries where occurred_at<=statement_timestamp())
 ) into v_result;
 return v_result;
end;$$;
revoke all on function public.cash_list(date,date,text,text,integer) from public,anon,authenticated;
grant execute on function public.cash_list(date,date,text,text,integer) to authenticated;
