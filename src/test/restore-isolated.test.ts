// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildRestoreSql } from "@/features/data/restore-sql";
import { tableOrder, validatePayload } from "@/features/data/backup-format";
import { backupFixture, fixtureId } from "./backup-fixture";
const db = new PGlite();
const target = fixtureId(500);
beforeAll(async () => {
  await db.exec(
    `create schema auth;create schema private;create role authenticated;create role anon;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;insert into auth.users values('${target}');set request.jwt.claim.sub='${target}';`,
  );
  const files = (await readdir("supabase/migrations")).sort();
  let count = 0;
  for (const file of files) {
    const contents = await readFile(`supabase/migrations/${file}`, "utf8");
    for (const m of contents.matchAll(/create table public\.(\w+)\s*\([\s\S]*?\n\);/gi)) {
      if (
        tableOrder.includes(m[1] as (typeof tableOrder)[number]) ||
        m[1] === "account_sync_state"
      ) {
        await db.exec(m[0]);
        count++;
      }
    }
  }
  expect(count).toBe(10);
  for (const name of [
    "20261022203248_cash_ledger.sql",
    "20261022203249_financial_reports.sql",
    "20261022212806_nutrition_and_exports.sql",
    "20261022214212_nutrition_mass_balance.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("restauração em Postgres isolado em memória", () => {
  it("recusa a restauração sem a condição explícita de isolamento", async () => {
    await expect(db.exec(buildRestoreSql(backupFixture(), target))).rejects.toThrow("isolado");
    await db.exec("rollback");
    expect(
      (await db.query("select count(*)::int as n from public.business_settings")).rows,
    ).toEqual([{ n: 0 }]);
  });
  it("reverte tudo quando um valor financeiro histórico não confere", async () => {
    await db.exec("set respiro.restore_isolated='YES_ISOLATED_EMPTY_DATABASE'");
    const p = backupFixture();
    p.data.sales[0]!.fee_cents = "999";
    await expect(db.exec(buildRestoreSql(p, target))).rejects.toThrow("históricos");
    await db.exec("rollback");
    expect((await db.query("select count(*)::int as n from public.materials")).rows).toEqual([
      { n: 0 },
    ]);
  });
  it("restaura relações, histórico, nutrição e agregados e recusa fundir dados", async () => {
    await db.exec(buildRestoreSql(backupFixture(), target));
    const result = await db.query<{ r: Record<string, unknown> }>("select public.cash_list() as r");
    expect(result.rows[0]!.r["closing_cents"]).toBe("11690");
    const report = await db.query<{
      r: { summary: { production_cents: string; product_profit_cents: string } };
    }>("select public.financial_report('month','2026-10-01') as r");
    expect(report.rows[0]!.r.summary.production_cents).toBe("768");
    expect(report.rows[0]!.r.summary.product_profit_cents).toBe("1122");
    const nutrition = await db.query<{ r: { ready: boolean } }>(
      `select public.recipe_nutrition('${fixtureId(4)}') as r`,
    );
    expect(nutrition.rows[0]!.r.ready).toBe(true);
    const exported = await db.query<{ r: unknown }>("select public.account_export() as r");
    expect(validatePayload(exported.rows[0]!.r).data).toEqual(backupFixture().data);
    await expect(db.exec(buildRestoreSql(backupFixture(), target))).rejects.toThrow(
      "já contém contas",
    );
    await db.exec("rollback");
  });
});
