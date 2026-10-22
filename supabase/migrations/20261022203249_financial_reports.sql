-- Expressões únicas para totais, intervalos e produtos. Valores em centavos como texto.
create function private.finance_totals(p_gross numeric,p_production numeric,p_fees numeric,p_expenses numeric,p_items numeric,p_sales bigint)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('gross_cents',coalesce(p_gross,0)::text,'production_cents',coalesce(p_production,0)::text,'fee_cents',coalesce(p_fees,0)::text,
 'net_cents',(coalesce(p_gross,0)-coalesce(p_fees,0))::text,'product_profit_cents',(coalesce(p_gross,0)-coalesce(p_production,0)-coalesce(p_fees,0))::text,
 'expense_cents',coalesce(p_expenses,0)::text,'cash_flow_cents',(coalesce(p_gross,0)-coalesce(p_fees,0)-coalesce(p_expenses,0))::text,
 'items',coalesce(p_items,0)::text,'sales',coalesce(p_sales,0)::text);
$$;
revoke all on function private.finance_totals(numeric,numeric,numeric,numeric,numeric,bigint) from public,anon,authenticated;
grant execute on function private.finance_totals(numeric,numeric,numeric,numeric,numeric,bigint) to authenticated;

create function public.financial_report(p_mode text,p_anchor date,p_product_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_start timestamp;v_end timestamp;v_step interval;v_unit text;v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 if coalesce(p_mode,'') not in ('day','month','year') or p_anchor is null or p_anchor<date '2000-01-01' or p_anchor>=date '2100-01-01' or p_product_page is null or p_product_page<0 or p_product_page>1000000 then raise exception 'Confira o período do resumo.' using errcode='22023';end if;
 v_start:=date_trunc(p_mode,p_anchor::timestamp);
 v_end:=v_start+case p_mode when 'day' then interval '1 day' when 'month' then interval '1 month' else interval '1 year' end;
 v_step:=case p_mode when 'day' then interval '1 hour' when 'month' then interval '1 day' else interval '1 month' end;
 v_unit:=case p_mode when 'day' then 'hour' when 'month' then 'day' else 'month' end;
 with entries as materialized(select * from public.cash_entries where kind<>'opening' and occurred_at>=(v_start at time zone 'America/Sao_Paulo') and occurred_at<(v_end at time zone 'America/Sao_Paulo')),
 buckets as (select date_trunc(v_unit,occurred_at at time zone 'America/Sao_Paulo') as bucket,
 sum(gross_cents) as gross,sum(production_cents) as production,sum(fee_cents) as fees,sum(expense_cents) as expenses,sum(items) as items,count(*) filter(where kind='sale') as sales from entries group by 1),
 timeline as (select g.bucket,private.finance_totals(b.gross,b.production,b.fees,b.expenses,b.items,b.sales) as metrics from generate_series(v_start,v_end-v_step,v_step) g(bucket) left join buckets b on b.bucket=g.bucket),
 products as materialized(select product_id,(array_agg(description order by occurred_at desc,id desc))[1] as name,
 sum(gross_cents) as gross,sum(production_cents) as production,sum(fee_cents) as fees,sum(items) as items,count(*) as sales from entries where kind='sale' group by product_id),
 product_page as (select * from products order by gross desc,product_id limit 20 offset p_product_page*20)
 select jsonb_build_object('start_date',v_start::date,'end_date',(v_end-interval '1 day')::date,
 'summary',(select private.finance_totals(sum(gross_cents),sum(production_cents),sum(fee_cents),sum(expense_cents),sum(items),count(*) filter(where kind='sale')) from entries),
 'buckets',(select jsonb_agg(jsonb_build_object('key',to_char(bucket,'YYYY-MM-DD"T"HH24:MI'),'metrics',metrics) order by bucket) from timeline),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',product_id,'name',name,'metrics',private.finance_totals(gross,production,fees,0,items,sales)) order by gross desc,product_id) from product_page),'[]'::jsonb),
 'product_count',(select count(*) from products)) into v_result;
 return v_result;
end;$$;
revoke all on function public.financial_report(text,date,integer) from public,anon,authenticated;
grant execute on function public.financial_report(text,date,integer) to authenticated;
