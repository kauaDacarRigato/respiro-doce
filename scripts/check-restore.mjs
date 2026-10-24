// Rehearsal uses a fresh in-memory Postgres only. It never connects to Supabase.
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { decodeBackup, tableOrder, validatePayload } from "../src/features/data/backup-format.ts";
import { buildRestoreSql } from "../src/features/data/restore-sql.ts";
const [file] = process.argv.slice(2);
if (!file) throw new Error("Uso: node scripts/check-restore.mjs backup.json");
const payload = await decodeBackup(await readFile(file, "utf8"));
const target = randomUUID(),
  db = new PGlite();
try {
  await db.exec(
    `create schema auth;create schema private;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;insert into auth.users values('${target}');set request.jwt.claim.sub='${target}';`,
  );
  const root = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(root)).sort()) {
    const sql = await readFile(new URL(name, root), "utf8");
    for (const m of sql.matchAll(/create table public\.(\w+)\s*\([\s\S]*?\n\);/gi))
      if (tableOrder.includes(m[1]) || m[1] === "account_sync_state") await db.exec(m[0]);
  }
  for (const name of [
    "20261022203248_cash_ledger.sql",
    "20261022203249_financial_reports.sql",
    "20261022212806_nutrition_and_exports.sql",
    "20261022214212_nutrition_mass_balance.sql",
  ])
    await db.exec(await readFile(new URL(name, root), "utf8"));
  await db.exec("set respiro.restore_isolated='YES_ISOLATED_EMPTY_DATABASE'");
  await db.exec(buildRestoreSql(payload, target));
  const exported = (await db.query("select public.account_export() as data")).rows[0].data;
  assert.deepEqual(validatePayload(exported).data, payload.data);
  const expected =
    BigInt(payload.data.business_settings.opening_balance_cents) +
    payload.data.sales.reduce((n, s) => n + BigInt(s.gross_cents) - BigInt(s.fee_cents), 0n) -
    payload.data.expenses.reduce((n, e) => n + BigInt(e.amount_cents), 0n);
  const cash = (await db.query("select public.cash_list() as data")).rows[0].data;
  assert.equal(cash.closing_cents, String(expected));
  console.log(
    JSON.stringify({
      verified: true,
      environment: "isolated-in-memory-postgres",
      version: 1,
      closing_cents: cash.closing_cents,
      tables: tableOrder.length,
    }),
  );
} finally {
  await db.close();
}
