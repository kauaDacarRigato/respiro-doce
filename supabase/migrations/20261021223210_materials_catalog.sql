create table public.materials (
  id uuid primary key,
  owner_id uuid not null references public.business_settings(owner_id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  normalized_name text generated always as (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) stored,
  kind text not null check (kind in ('ingredient', 'packaging')),
  unit text not null check (unit in ('g','kg','ml','l','un')),
  package_quantity numeric(18,6) not null check (package_quantity > 0 and package_quantity <= 1000000000),
  package_price_cents bigint not null check (package_price_cents >= 0 and package_price_cents <= 100000000000),
  piece_weight_g numeric(18,6) check (piece_weight_g > 0 and piece_weight_g <= 1000000),
  density_g_ml numeric(18,6) check (density_g_ml > 0 and density_g_ml <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, id),
  unique (owner_id, normalized_name),
  check (kind <> 'packaging' or (unit = 'un' and trunc(package_quantity) = package_quantity and piece_weight_g is null and density_g_ml is null)),
  check (piece_weight_g is null or (kind = 'ingredient' and unit = 'un')),
  check (density_g_ml is null or (kind = 'ingredient' and unit in ('ml','l')))
);

create table public.material_nutrition (
  material_id uuid primary key,
  owner_id uuid not null,
  base_unit text not null check (base_unit in ('g','ml')),
  source text not null default '' check (length(source) <= 500),
  energy_kcal numeric(14,6) check (energy_kcal >= 0 and energy_kcal <= 1000000),
  carbohydrates_g numeric(14,6) check (carbohydrates_g >= 0 and carbohydrates_g <= 1000000),
  total_sugars_g numeric(14,6) check (total_sugars_g >= 0 and total_sugars_g <= 1000000),
  added_sugars_g numeric(14,6) check (added_sugars_g >= 0 and added_sugars_g <= 1000000),
  proteins_g numeric(14,6) check (proteins_g >= 0 and proteins_g <= 1000000),
  total_fat_g numeric(14,6) check (total_fat_g >= 0 and total_fat_g <= 1000000),
  saturated_fat_g numeric(14,6) check (saturated_fat_g >= 0 and saturated_fat_g <= 1000000),
  trans_fat_g numeric(14,6) check (trans_fat_g >= 0 and trans_fat_g <= 1000000),
  fiber_g numeric(14,6) check (fiber_g >= 0 and fiber_g <= 1000000),
  sodium_mg numeric(14,6) check (sodium_mg >= 0 and sodium_mg <= 1000000),
  foreign key (owner_id, material_id) references public.materials(owner_id, id) on delete cascade
);
create index material_nutrition_owner_idx on public.material_nutrition(owner_id, material_id);
create index materials_owner_name_idx on public.materials(owner_id, name, id);

create table public.account_sync_state (
  owner_id uuid primary key references public.business_settings(owner_id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);
create table private.command_receipts (
  owner_id uuid not null references public.business_settings(owner_id) on delete cascade,
  command_id uuid not null,
  input_hash text not null,
  target_id uuid not null,
  primary key (owner_id, command_id)
);
revoke all on private.command_receipts from public, anon, authenticated;
alter table private.command_receipts enable row level security;

alter table public.materials enable row level security;
alter table public.material_nutrition enable row level security;
alter table public.account_sync_state enable row level security;
revoke all on public.materials, public.material_nutrition, public.account_sync_state from public, anon, authenticated;
grant select on public.materials, public.material_nutrition, public.account_sync_state to authenticated;
create policy materials_read_own on public.materials for select to authenticated using (owner_id = (select auth.uid()));
create policy nutrition_read_own on public.material_nutrition for select to authenticated using (owner_id = (select auth.uid()));
create policy revision_read_own on public.account_sync_state for select to authenticated using (owner_id = (select auth.uid()));
create trigger materials_updated_at before update on public.materials for each row execute function private.set_updated_at();

-- Os eventos carregam apenas um número de revisão, nunca dados do cadastro excluído.
create policy receive_own_account_changes on realtime.messages for select to authenticated
  using (extension = 'broadcast' and realtime.topic() = 'account:' || (select auth.uid())::text);

create function private.material_command(command_id uuid, action text, material_id uuid, data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  account_id uuid := auth.uid();
  fingerprint text;
  previous private.command_receipts%rowtype;
  next_revision bigint;
  item public.materials%rowtype;
  nutrition jsonb;
begin
  if account_id is null then raise exception 'Autenticação necessária' using errcode = '42501'; end if;
  if command_id is null or material_id is null or action not in ('create','update','delete') or action is null or data is null or jsonb_typeof(data) <> 'object' then
    raise exception 'Operação inválida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id::text, 0));
  perform private.initialize_own_account();
  fingerprint := encode(extensions.digest(jsonb_build_object('action',action,'id',material_id,'data',data)::text,'sha256'),'hex');
  select * into previous from private.command_receipts r where r.owner_id = account_id and r.command_id = material_command.command_id;
  if found then
    if previous.input_hash <> fingerprint then raise exception 'Esta tentativa já foi usada com outros dados. Atualize e tente novamente.' using errcode = '22023'; end if;
    return jsonb_build_object('id', previous.target_id, 'status', case when exists(select 1 from public.materials m where m.owner_id = account_id and m.id = previous.target_id) then 'saved' else 'gone' end);
  end if;
  if action in ('update','delete') and not exists(select 1 from public.materials m where m.owner_id = account_id and m.id = material_id) then
    raise exception 'Este cadastro não está mais disponível. Atualize a lista.' using errcode = 'P0002';
  end if;
  if action = 'delete' then
    delete from public.materials m where m.owner_id = account_id and m.id = material_id;
  else
    item.id := material_id;
    item.owner_id := account_id;
    item.name := regexp_replace(btrim(data->>'name'), '\s+', ' ', 'g');
    item.kind := data->>'kind'; item.unit := data->>'unit';
    item.package_quantity := (data->>'package_quantity')::numeric;
    if (data->>'package_price_cents')::numeric <> trunc((data->>'package_price_cents')::numeric) then
      raise exception 'O preço deve ser informado em centavos inteiros.' using errcode='22023';
    end if;
    item.package_price_cents := (data->>'package_price_cents')::bigint;
    item.piece_weight_g := (data->>'piece_weight_g')::numeric;
    item.density_g_ml := (data->>'density_g_ml')::numeric;
    if action = 'create' then
      insert into public.materials(id,owner_id,name,kind,unit,package_quantity,package_price_cents,piece_weight_g,density_g_ml)
      values(item.id,item.owner_id,item.name,item.kind,item.unit,item.package_quantity,item.package_price_cents,item.piece_weight_g,item.density_g_ml);
    else
      update public.materials m set name=item.name,kind=item.kind,unit=item.unit,package_quantity=item.package_quantity,
        package_price_cents=item.package_price_cents,piece_weight_g=item.piece_weight_g,density_g_ml=item.density_g_ml
      where m.id = material_id and m.owner_id = account_id;
    end if;
    nutrition := data->'nutrition';
    if item.kind = 'packaging' then
      delete from public.material_nutrition n where n.owner_id = account_id and n.material_id = material_id;
    elsif nutrition is not null and jsonb_typeof(nutrition) <> 'null' then
      if jsonb_typeof(nutrition) <> 'object' then raise exception 'Dados nutricionais inválidos' using errcode='22023'; end if;
      insert into public.material_nutrition(material_id,owner_id,base_unit,source,energy_kcal,carbohydrates_g,total_sugars_g,added_sugars_g,proteins_g,total_fat_g,saturated_fat_g,trans_fat_g,fiber_g,sodium_mg)
      values(material_id,account_id,nutrition->>'base_unit',coalesce(nutrition->>'source',''),
        (nutrition->>'energy_kcal')::numeric,(nutrition->>'carbohydrates_g')::numeric,(nutrition->>'total_sugars_g')::numeric,
        (nutrition->>'added_sugars_g')::numeric,(nutrition->>'proteins_g')::numeric,(nutrition->>'total_fat_g')::numeric,
        (nutrition->>'saturated_fat_g')::numeric,(nutrition->>'trans_fat_g')::numeric,(nutrition->>'fiber_g')::numeric,(nutrition->>'sodium_mg')::numeric)
      on conflict on constraint material_nutrition_pkey do update set base_unit=excluded.base_unit,source=excluded.source,
        energy_kcal=excluded.energy_kcal,carbohydrates_g=excluded.carbohydrates_g,total_sugars_g=excluded.total_sugars_g,
        added_sugars_g=excluded.added_sugars_g,proteins_g=excluded.proteins_g,total_fat_g=excluded.total_fat_g,
        saturated_fat_g=excluded.saturated_fat_g,trans_fat_g=excluded.trans_fat_g,fiber_g=excluded.fiber_g,sodium_mg=excluded.sodium_mg;
    else
      delete from public.material_nutrition n where n.owner_id=account_id and n.material_id=material_id;
    end if;
  end if;
  insert into private.command_receipts(owner_id,command_id,input_hash,target_id) values(account_id,command_id,fingerprint,material_id);
  insert into public.account_sync_state(owner_id,revision) values(account_id,1)
    on conflict(owner_id) do update set revision = public.account_sync_state.revision + 1 returning revision into next_revision;
  perform realtime.send(jsonb_build_object('revision',next_revision),'changed','account:' || account_id::text,true);
  return jsonb_build_object('id',material_id,'status',case when action='delete' then 'gone' else 'saved' end);
end;
$$;
revoke all on function private.material_command(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.material_command(uuid,text,uuid,jsonb) to authenticated;
create function public.material_command(p_command_id uuid,p_action text,p_material_id uuid,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as 'select private.material_command(p_command_id,p_action,p_material_id,p_data)';
revoke all on function public.material_command(uuid,text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.material_command(uuid,text,uuid,jsonb) to authenticated;
