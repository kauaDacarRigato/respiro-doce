import { backupTables, tableOrder, validatePayload } from "./backup-format.ts";
const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
// Only generates SQL for a separately prepared, EMPTY app database. Never calls
// Supabase or connects to a database. The guard also refuses the active project.
export function buildRestoreSql(input: unknown, targetOwner: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetOwner))
    throw new Error("Dono de destino inválido.");
  const payload = validatePayload(input);
  const sql = [
    "-- Somente banco ISOLADO e VAZIO, com migrações aplicadas e identidade de destino criada.",
    "begin;",
    "set local standard_conforming_strings=on;",
    `do $guard$ begin
 if current_setting('respiro.restore_isolated',true) is distinct from 'YES_ISOLATED_EMPTY_DATABASE' then raise exception 'Defina respiro.restore_isolated somente em um banco isolado vazio.';end if;
 if exists(select 1 from public.business_settings) then raise exception 'Restauração recusada: banco já contém contas. Não use o banco ativo.';end if;
 if not exists(select 1 from auth.users where id=${literal(targetOwner)}::uuid) then raise exception 'Identidade de destino inexistente.';end if;
 end $guard$;`,
  ];
  for (const table of tableOrder) {
    const rows =
      table === "business_settings" ? [payload.data.business_settings] : payload.data[table];
    if (!rows.length) continue;
    const cols = [
      "owner_id",
      ...Object.keys(backupTables[table].shape).filter(
        (k) => !["gross_cents", "production_cents", "fee_cents"].includes(k),
      ),
    ];
    sql.push(
      `insert into public.${table}(${cols.join(",")}) select ${cols.map((k) => `r.${k}`).join(",")} from jsonb_array_elements(${literal(JSON.stringify(rows))}::jsonb) j cross join lateral jsonb_populate_record(null::public.${table}, j||jsonb_build_object('owner_id',${literal(targetOwner)})) r;`,
    );
  }
  let verifyTag = "$verify$";
  const historical = JSON.stringify(payload.data.sales);
  while (historical.includes(verifyTag)) verifyTag = `${verifyTag.slice(0, -1)}_x$`;
  // Compare generated historical values too; a drift aborts the whole restore.
  sql.push(
    `do ${verifyTag} begin
 if exists(select 1 from jsonb_array_elements(${literal(JSON.stringify(payload.data.sales))}::jsonb) j join public.sales s on s.id=(j->>'id')::uuid where s.gross_cents<>(j->>'gross_cents')::numeric or s.production_cents<>(j->>'production_cents')::numeric or s.fee_cents<>(j->>'fee_cents')::numeric) then raise exception 'Os valores históricos não conferem.';end if;
 end ${verifyTag};`,
    "commit;",
  );
  return sql.join("\n");
}
