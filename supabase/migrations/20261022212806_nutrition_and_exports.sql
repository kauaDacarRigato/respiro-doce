-- Read-only nutrition estimates. No claim of a packaging-ready legal label.
create function public.recipe_nutrition(p_recipe_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare r public.recipes%rowtype; c record; n public.material_nutrition%rowtype;
 keys text[]:=array['energy_kcal','carbohydrates_g','total_sugars_g','added_sugars_g','proteins_g','total_fat_g','saturated_fat_g','trans_fat_g','fiber_g','sodium_mg'];
 labels jsonb:='{"energy_kcal":"valor energético","carbohydrates_g":"carboidratos","total_sugars_g":"açúcares totais","added_sugars_g":"açúcares adicionados","proteins_g":"proteínas","total_fat_g":"gorduras totais","saturated_fat_g":"gorduras saturadas","trans_fat_g":"gorduras trans","fiber_g":"fibras","sodium_mg":"sódio"}';
 refs jsonb:='{"energy_kcal":2000,"carbohydrates_g":300,"added_sugars_g":50,"proteins_g":50,"total_fat_g":65,"saturated_fat_g":20,"fiber_g":25,"sodium_mg":2000}';
 totals jsonb:='{}';parts jsonb:='[]';rows jsonb:='[]';issues text[]:='{}'; missing text[];
 mass numeric;volume numeric;used numeric;amount numeric;per100 numeric;portion numeric;k text;values_json jsonb;contribution jsonb;foods int:=0;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 select * into r from public.recipes where id=p_recipe_id and owner_id=auth.uid();
 if not found then raise exception 'Receita indisponível.' using errcode='P0002';end if;
 if r.final_quantity is null then issues:=array_append(issues,'Informe o rendimento final medido da receita.');end if;
 if r.serving_quantity is null or r.serving_unit<>r.final_unit then issues:=array_append(issues,'Informe uma porção na mesma unidade do rendimento final.');end if;
 if r.serving_quantity>r.final_quantity then issues:=array_append(issues,'A porção não pode superar o rendimento do lote.');end if;
 if btrim(r.household_measure)='' then issues:=array_append(issues,'Informe a medida caseira da porção.');end if;
 foreach k in array keys loop totals:=totals||jsonb_build_object(k,0);end loop;
 for c in select m.id,m.name,m.piece_weight_g,m.density_g_ml,rm.quantity,rm.unit from public.recipe_materials rm join public.materials m on m.owner_id=rm.owner_id and m.id=rm.material_id where rm.recipe_id=r.id and rm.owner_id=auth.uid() and m.kind='ingredient' order by m.name,m.id loop
  foods:=foods+1;mass:=null;volume:=null;used:=null;missing:='{}';contribution:='{}';
  if c.unit in ('g','kg') then mass:=c.quantity*case c.unit when 'kg' then 1000 else 1 end;
  elsif c.unit in ('ml','l') then volume:=c.quantity*case c.unit when 'l' then 1000 else 1 end;
  else mass:=c.quantity*c.piece_weight_g;end if;
  if mass is null and volume is not null and c.density_g_ml is not null then mass:=volume*c.density_g_ml;end if;
  if volume is null and mass is not null and c.density_g_ml is not null then volume:=mass/c.density_g_ml;end if;
  select * into n from public.material_nutrition where material_id=c.id and owner_id=auth.uid();
  if not found then issues:=array_append(issues,c.name||': cadastre os valores nutricionais por 100 g ou 100 mL.');end if;
  if coalesce(btrim(n.source),'')='' then issues:=array_append(issues,c.name||': informe a fonte dos valores nutricionais.');end if;
  used:=case n.base_unit when 'g' then mass when 'ml' then volume end;
  if n.material_id is not null and used is null then issues:=array_append(issues,c.name||': falta equivalência de peso por unidade ou densidade para a base nutricional.');end if;
  values_json:=to_jsonb(n);
  foreach k in array keys loop
   amount:=(values_json->>k)::numeric;
   if amount is null then missing:=array_append(missing,labels->>k);end if;
   contribution:=contribution||jsonb_build_object(k,case when amount is not null and used is not null then (amount*used/100)::text else null end);
   if amount is not null and used is not null then totals:=totals||jsonb_build_object(k,(totals->>k)::numeric+amount*used/100);end if;
  end loop;
  if cardinality(missing)>0 then issues:=array_append(issues,c.name||': faltam '||array_to_string(missing,', ')||'.');end if;
  if n.added_sugars_g>n.total_sugars_g or n.total_sugars_g>n.carbohydrates_g or n.saturated_fat_g+n.trans_fat_g>n.total_fat_g then issues:=array_append(issues,c.name||': confira a coerência entre açúcares, carboidratos e gorduras.');end if;
  if n.base_unit='g' and (n.carbohydrates_g>100 or n.proteins_g>100 or n.total_fat_g>100 or n.fiber_g>100 or n.sodium_mg>100000) then issues:=array_append(issues,c.name||': há valores incompatíveis com a base de 100 g.');end if;
  parts:=parts||jsonb_build_array(jsonb_build_object('id',c.id,'name',c.name,'quantity',c.quantity::text,'unit',c.unit,'base_unit',n.base_unit,'used_base',used::text,'source',n.source,'contributions',contribution));
 end loop;
 if foods=0 then issues:=array_append(issues,'Adicione pelo menos um ingrediente alimentício. Embalagens não entram na nutrição.');end if;
 if cardinality(issues)=0 then
  foreach k in array array['energy_kcal','energy_kj','carbohydrates_g','total_sugars_g','added_sugars_g','proteins_g','total_fat_g','saturated_fat_g','trans_fat_g','fiber_g','sodium_mg'] loop
   amount:=case k when 'energy_kj' then (totals->>'energy_kcal')::numeric*4.184 else (totals->>k)::numeric end;
   per100:=amount/r.final_quantity*100;portion:=amount/r.final_quantity*r.serving_quantity;
   rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'total',amount::text,'per100',per100::text,'portion',portion::text,'vd',case when refs ? k then (portion/(refs->>k)::numeric*100)::text else null end));
  end loop;
 end if;
 return jsonb_build_object('ready',cardinality(issues)=0,'issues',to_jsonb(issues),'recipe',jsonb_build_object('id',r.id,'name',r.name,'final_quantity',r.final_quantity::text,'final_unit',r.final_unit,'serving_quantity',r.serving_quantity::text,'serving_unit',r.serving_unit,'household_measure',r.household_measure),'rows',rows,'ingredients',parts,'calculated_at',statement_timestamp(),'kind','estimate-not-label','reference','IN75-2020-adults-estimate-v1');
end;$$;
revoke all on function public.recipe_nutrition(uuid) from public,anon,authenticated;
grant execute on function public.recipe_nutrition(uuid) to authenticated;

-- Convert numbers to strings before JSON crosses JavaScript's precision boundary.
create function private.export_record(p_row jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_object_agg(key,case when jsonb_typeof(value)='number' then to_jsonb(value#>>'{}') else value end) from jsonb_each(p_row-'owner_id'-'normalized_name');
$$;
revoke all on function private.export_record(jsonb) from public,anon,authenticated;
grant execute on function private.export_record(jsonb) to authenticated;
create function public.account_export() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 if not exists(select 1 from public.business_settings where owner_id=auth.uid()) then raise exception 'Prepare sua conta antes de exportar.' using errcode='P0002';end if;
 select jsonb_build_object('schema','respiro-doce-account','version',1,'account_id',auth.uid(),'exported_at',statement_timestamp(),'revision',coalesce((select revision::text from public.account_sync_state where owner_id=auth.uid()),'0'),
 'data',jsonb_build_object(
 'business_settings',(select private.export_record(to_jsonb(t)) from public.business_settings t where owner_id=auth.uid()),
 'expense_categories',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by id) from public.expense_categories t where owner_id=auth.uid()),'[]'::jsonb),
 'materials',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by id) from public.materials t where owner_id=auth.uid()),'[]'::jsonb),
 'material_nutrition',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by material_id) from public.material_nutrition t where owner_id=auth.uid()),'[]'::jsonb),
 'recipes',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by id) from public.recipes t where owner_id=auth.uid()),'[]'::jsonb),
 'recipe_materials',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by recipe_id,material_id) from public.recipe_materials t where owner_id=auth.uid()),'[]'::jsonb),
 'customers',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by id) from public.customers t where owner_id=auth.uid()),'[]'::jsonb),
 'sales',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by id) from public.sales t where owner_id=auth.uid()),'[]'::jsonb),
 'expenses',coalesce((select jsonb_agg(private.export_record(to_jsonb(t)) order by id) from public.expenses t where owner_id=auth.uid()),'[]'::jsonb))) into result;
 if octet_length(result::text)>20000000 then raise exception 'A exportação supera 20 MB. Solicite uma cópia administrativa completa.' using errcode='54000';end if;
 return result;
end;$$;
revoke all on function public.account_export() from public,anon,authenticated;
grant execute on function public.account_export() to authenticated;

create function public.customers_export(p_search text default '') returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;term text:=btrim(coalesce(p_search,''));phone_search boolean;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária' using errcode='42501';end if;
 phone_search:=term~'^[+0-9 ().-]+$';
 select coalesce(jsonb_agg(to_jsonb(c)-'owner_id' order by name,id),'[]'::jsonb) into result from public.customer_catalog c where owner_id=auth.uid() and
 (term='' or (phone_search and strpos(phone,regexp_replace(term,'[^0-9]','','g'))>0) or (not phone_search and strpos(lower(name),lower(term))>0));
 if octet_length(result::text)>20000000 then raise exception 'A exportação supera 20 MB. Refine a busca de clientes.' using errcode='54000';end if;
 return jsonb_build_object('items',result,'search',term,'exported_at',statement_timestamp());
end;$$;
revoke all on function public.customers_export(text) from public,anon,authenticated;
grant execute on function public.customers_export(text) to authenticated;
