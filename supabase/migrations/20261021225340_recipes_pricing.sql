-- Receitas com composição atômica e custos atuais calculados em numeric.
create table public.recipes (
  id uuid primary key,
  owner_id uuid not null references public.business_settings(owner_id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 120),
  normalized_name text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  yield_units integer check(yield_units > 0 and yield_units <= 1000000),
  indirect_percent numeric not null default 25 check(indirect_percent between 0 and 1000 and scale(indirect_percent)<=3),
  fee_percent numeric not null default 0 check(fee_percent>=0 and fee_percent<100 and scale(fee_percent)<=3),
  final_quantity numeric check(final_quantity>0 and final_quantity<=1000000000 and scale(final_quantity)<=6),
  final_unit text not null default 'g' check(final_unit in ('g','ml')),
  serving_quantity numeric check(serving_quantity>0 and serving_quantity<=1000000000 and scale(serving_quantity)<=6),
  serving_unit text not null default 'g' check(serving_unit in ('g','ml')),
  household_measure text not null default '' check(length(household_measure)<=120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,id), unique(owner_id,normalized_name)
);
create table public.recipe_materials (
  owner_id uuid not null,
  recipe_id uuid not null,
  material_id uuid not null,
  quantity numeric not null check(quantity>0 and quantity<=1000000000 and scale(quantity)<=6),
  unit text not null check(unit in ('g','kg','ml','l','un')),
  primary key(recipe_id,material_id),
  foreign key(owner_id,recipe_id) references public.recipes(owner_id,id) on delete cascade,
  foreign key(owner_id,material_id) references public.materials(owner_id,id) on delete no action deferrable initially deferred
);
create index recipe_materials_owner_material on public.recipe_materials(owner_id,material_id);
create index recipe_materials_owner_recipe on public.recipe_materials(owner_id,recipe_id);
create trigger recipes_updated_at before update on public.recipes for each row execute function private.set_updated_at();
alter table public.recipes enable row level security;
alter table public.recipe_materials enable row level security;
revoke all on public.recipes,public.recipe_materials from anon,authenticated;
grant select on public.recipes,public.recipe_materials to authenticated;
create policy recipes_read_own on public.recipes for select to authenticated using(owner_id=(select auth.uid()));
create policy recipe_materials_read_own on public.recipe_materials for select to authenticated using(owner_id=(select auth.uid()));

-- Bloqueia alterações que reinterpretariam as quantidades já usadas.
create function private.protect_recipe_material() returns trigger language plpgsql security definer set search_path='' as $$
declare names text;
begin
  if not exists(select 1 from public.business_settings where owner_id=old.owner_id) then return old; end if;
  if tg_op='UPDATE' then
    if (new.kind,new.unit,new.piece_weight_g,new.density_g_ml) is not distinct from (old.kind,old.unit,old.piece_weight_g,old.density_g_ml) then return new; end if;
  end if;
  select string_agg(name, ', ' order by name) into names from (
    select r.name from public.recipe_materials c join public.recipes r on r.owner_id=c.owner_id and r.id=c.recipe_id
    where c.owner_id=old.owner_id and c.material_id=old.id order by r.name limit 5
  ) used;
  if names is not null then
    raise exception 'Usado em: %. Remova este insumo dessas receitas antes de excluir ou alterar tipo, unidade ou equivalências.',names using errcode='23503';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function private.protect_recipe_material() from public,anon,authenticated;
create trigger materials_protect_recipes before update or delete on public.materials for each row execute function private.protect_recipe_material();

-- Conversões explícitas. A embalagem sempre usa unidades inteiras.
create function private.recipe_calculate(data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  account_id uuid := auth.uid();
  component jsonb; m public.materials%rowtype;
  quantity numeric; used numeric; purchased numeric; cost numeric;
  direct numeric := 0; ingredients numeric := 0; packaging numeric := 0;
  edible_g numeric := 0; mass_known boolean := true; has_food boolean := false;
  yield_value numeric; indirect numeric; fee numeric; final_value numeric; serving numeric;
  lot numeric; unit_cost numeric; suggestion numeric; estimated_fee numeric; production_cents numeric;
  seen uuid[] := '{}'; components jsonb := '[]';
begin
  if account_id is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if jsonb_typeof(data)<>'object' or data is null then raise exception 'Receita inválida' using errcode='22023'; end if;
  yield_value := (data->>'yield_units')::numeric;
  indirect := (data->>'indirect_percent')::numeric; fee := (data->>'fee_percent')::numeric;
  final_value := (data->>'final_quantity')::numeric; serving := (data->>'serving_quantity')::numeric;
  if indirect is null or indirect<0 or indirect>1000 or scale(indirect)>3 or fee is null or fee<0 or fee>=100 or scale(fee)>3
    or (yield_value is not null and (yield_value<=0 or yield_value>1000000 or yield_value<>trunc(yield_value)))
    or (final_value is not null and (final_value<=0 or final_value>1000000000 or scale(final_value)>6))
    or (serving is not null and (serving<=0 or serving>1000000000 or scale(serving)>6))
    or coalesce(data->>'final_unit','') not in ('g','ml') or coalesce(data->>'serving_unit','') not in ('g','ml') then
    raise exception 'Confira rendimento, quantidades e percentuais.' using errcode='22023';
  end if;
  if jsonb_typeof(data->'components') is distinct from 'array' then raise exception 'Composição inválida' using errcode='22023'; end if;
  if jsonb_array_length(data->'components')>200 then raise exception 'Limite de 200 componentes por receita.' using errcode='22023'; end if;
  for component in select value from jsonb_array_elements(data->'components') loop
    select * into m from public.materials where owner_id=account_id and id=(component->>'material_id')::uuid;
    if not found then raise exception 'Um insumo não está mais disponível. Atualize a composição.' using errcode='P0002'; end if;
    if m.id=any(seen) then raise exception 'Adicione cada insumo uma única vez.' using errcode='22023'; end if;
    seen := array_append(seen,m.id);
    quantity := (component->>'quantity')::numeric;
    if quantity is null or quantity<=0 or quantity>1000000000 or scale(quantity)>6 or coalesce(component->>'unit','') not in ('g','kg','ml','l','un') then
      raise exception 'Quantidade ou unidade inválida na composição.' using errcode='22023'; end if;
    if m.kind='packaging' and (component->>'unit'<>'un' or quantity<>trunc(quantity)) then
      raise exception 'Use unidades inteiras para embalagens.' using errcode='22023'; end if;
    -- Tudo convertido à mesma base de compra: g, mL ou unidade.
    used := quantity * case when component->>'unit' in ('kg','l') then 1000 else 1 end;
    purchased := m.package_quantity * case when m.unit in ('kg','l') then 1000 else 1 end;
    if m.unit in ('g','kg') and component->>'unit' not in ('g','kg') then
      raise exception 'Use g ou kg para este insumo.' using errcode='22023';
    elsif m.unit in ('ml','l') then
      if component->>'unit' in ('g','kg') and m.density_g_ml is not null then used:=used/m.density_g_ml;
      elsif component->>'unit' not in ('ml','l') then raise exception 'Conversão exige densidade informada.' using errcode='22023'; end if;
    elsif m.unit='un' then
      if component->>'unit' in ('g','kg') and m.piece_weight_g is not null then used:=used/m.piece_weight_g;
      elsif component->>'unit'<>'un' then raise exception 'Conversão exige peso da unidade informado.' using errcode='22023'; end if;
    end if;
    cost := m.package_price_cents * used / purchased / 100;
    direct := direct + cost;
    if m.kind='packaging' then packaging:=packaging+cost;
    else
      ingredients:=ingredients+cost; has_food:=true;
      if m.unit in ('g','kg') then edible_g:=edible_g+used;
      elsif m.unit='un' and m.piece_weight_g is not null then edible_g:=edible_g+used*m.piece_weight_g;
      elsif m.unit in ('ml','l') and m.density_g_ml is not null then edible_g:=edible_g+used*m.density_g_ml;
      else mass_known:=false; end if;
    end if;
    components:=components || jsonb_build_array(jsonb_build_object('material_id',m.id,'name',m.name,'kind',m.kind,'quantity',quantity::text,'unit',component->>'unit','cost',cost::text));
  end loop;
  lot:=direct*(1+indirect/100);
  -- Sem alimento, composição, rendimento ou quantidade final, não sugerir preço.
  if has_food and yield_value is not null and final_value is not null then
    unit_cost:=lot/yield_value;
    suggestion:=round(unit_cost*3/(1-fee/100)*100);
    estimated_fee:=round(suggestion*fee/100);
    production_cents:=round(unit_cost*100);
  end if;
  return jsonb_build_object('ingredients',ingredients::text,'packaging',packaging::text,'direct',direct::text,
    'indirect',(direct*indirect/100)::text,'lot',lot::text,'unit_cost',unit_cost::text,
    'suggested_cents',suggestion::text,'fee_cents',estimated_fee::text,
    'total_unit_cents',(production_cents+estimated_fee)::text,'profit_cents',(suggestion-production_cents-estimated_fee)::text,
    'raw_edible_g',case when mass_known and has_food then edible_g::text else null end,
    'ready',unit_cost is not null,'reason',case when not has_food then 'Adicione pelo menos um ingrediente alimentício.'
      when yield_value is null then 'Informe o rendimento em unidades para calcular o preço.'
      when final_value is null then 'Informe o peso ou volume final após o preparo para concluir a receita.' else null end,
    'components',components);
end; $$;
revoke all on function private.recipe_calculate(jsonb) from public,anon,authenticated;
grant execute on function private.recipe_calculate(jsonb) to authenticated;
create function public.recipe_preview(p_data jsonb) returns jsonb language sql security invoker set search_path='' as 'select private.recipe_calculate(p_data)';
revoke all on function public.recipe_preview(jsonb) from public,anon,authenticated;
grant execute on function public.recipe_preview(jsonb) to authenticated;

create view public.recipe_catalog with(security_invoker=true) as
select r.*, c.components, private.recipe_calculate(to_jsonb(r) || jsonb_build_object('components',c.components)) as pricing
from public.recipes r cross join lateral (
  select coalesce(jsonb_agg(jsonb_build_object('material_id',m.material_id,'quantity',m.quantity::text,'unit',m.unit) order by m.material_id),'[]'::jsonb) as components
  from public.recipe_materials m where m.owner_id=r.owner_id and m.recipe_id=r.id
) c;
revoke all on public.recipe_catalog from public,anon,authenticated;
grant select on public.recipe_catalog to authenticated;

create function private.recipe_command(command_id uuid,action text,recipe_id uuid,data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare account_id uuid:=auth.uid(); fingerprint text; previous private.command_receipts%rowtype; next_revision bigint; item public.recipes%rowtype;
begin
  if account_id is null then raise exception 'Autenticação necessária' using errcode='42501'; end if;
  if command_id is null or recipe_id is null or action is null or action not in ('create','update','delete') or data is null or jsonb_typeof(data)<>'object' then raise exception 'Operação inválida' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id::text,0));
  perform private.initialize_own_account();
  fingerprint:=encode(extensions.digest(jsonb_build_object('entity','recipe','action',action,'id',recipe_id,'data',data)::text,'sha256'),'hex');
  select * into previous from private.command_receipts r where r.owner_id=account_id and r.command_id=command_id;
  if found then
    if previous.input_hash<>fingerprint then raise exception 'Esta tentativa já foi usada com outros dados.' using errcode='22023'; end if;
    return jsonb_build_object('id',previous.target_id,'status',case when exists(select 1 from public.recipes where owner_id=account_id and id=previous.target_id) then 'saved' else 'gone' end);
  end if;
  if action in ('update','delete') and not exists(select 1 from public.recipes where owner_id=account_id and id=recipe_id) then raise exception 'Esta receita não está mais disponível.' using errcode='P0002'; end if;
  if action='delete' then delete from public.recipes where owner_id=account_id and id=recipe_id;
  else
    perform private.recipe_calculate(data);
    item.name:=regexp_replace(btrim(data->>'name'),'\s+',' ','g');
    item.yield_units:=(data->>'yield_units')::integer; item.indirect_percent:=(data->>'indirect_percent')::numeric;
    item.fee_percent:=(data->>'fee_percent')::numeric; item.final_quantity:=(data->>'final_quantity')::numeric;
    item.final_unit:=data->>'final_unit'; item.serving_quantity:=(data->>'serving_quantity')::numeric;
    item.serving_unit:=data->>'serving_unit'; item.household_measure:=coalesce(data->>'household_measure','');
    if action='create' then
      insert into public.recipes(id,owner_id,name,yield_units,indirect_percent,fee_percent,final_quantity,final_unit,serving_quantity,serving_unit,household_measure)
      values(recipe_id,account_id,item.name,item.yield_units,item.indirect_percent,item.fee_percent,item.final_quantity,item.final_unit,item.serving_quantity,item.serving_unit,item.household_measure);
    else
      update public.recipes set name=item.name,yield_units=item.yield_units,indirect_percent=item.indirect_percent,fee_percent=item.fee_percent,
      final_quantity=item.final_quantity,final_unit=item.final_unit,serving_quantity=item.serving_quantity,serving_unit=item.serving_unit,household_measure=item.household_measure where owner_id=account_id and id=recipe_id;
      delete from public.recipe_materials where owner_id=account_id and recipe_id=recipe_command.recipe_id;
    end if;
    insert into public.recipe_materials(owner_id,recipe_id,material_id,quantity,unit)
      select account_id,recipe_id,(c->>'material_id')::uuid,(c->>'quantity')::numeric,c->>'unit' from jsonb_array_elements(data->'components') c;
  end if;
  insert into private.command_receipts(owner_id,command_id,input_hash,target_id) values(account_id,command_id,fingerprint,recipe_id);
  insert into public.account_sync_state(owner_id,revision) values(account_id,1) on conflict(owner_id) do update set revision=public.account_sync_state.revision+1 returning revision into next_revision;
  perform realtime.send(jsonb_build_object('revision',next_revision),'changed','account:'||account_id::text,true);
  return jsonb_build_object('id',recipe_id,'status',case when action='delete' then 'gone' else 'saved' end);
end; $$;
revoke all on function private.recipe_command(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.recipe_command(uuid,text,uuid,jsonb) to authenticated;
create function public.recipe_command(p_command_id uuid,p_action text,p_recipe_id uuid,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as 'select private.recipe_command(p_command_id,p_action,p_recipe_id,p_data)';
revoke all on function public.recipe_command(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.recipe_command(uuid,text,uuid,jsonb) to authenticated;
