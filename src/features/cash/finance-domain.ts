import { z } from "zod";
import { priceInCents } from "@/features/products/material-domain";
import { readDraft } from "@/lib/drafts";
export type CashEntry = {
  id: string;
  kind: "sale" | "expense" | "opening";
  description: string;
  occurred_at: string;
  category_name: string | null;
  delta_cents: string;
  balance_cents: string;
  gross_cents: string;
  fee_cents: string;
};
export type CashResult = {
  items: CashEntry[];
  total: number;
  previous_cents: string;
  incoming_cents: string;
  expenses_cents: string;
  opening_cents: string;
  closing_cents: string;
  current_cents: string;
};
export type FinanceTotals = {
  gross_cents: string;
  production_cents: string;
  fee_cents: string;
  net_cents: string;
  product_profit_cents: string;
  expense_cents: string;
  cash_flow_cents: string;
  items: string;
  sales: string;
};
export type ReportMode = "day" | "month" | "year";
export type FinancialReport = {
  start_date: string;
  end_date: string;
  summary: FinanceTotals;
  buckets: { key: string; metrics: FinanceTotals }[];
  products: { id: string; name: string; metrics: FinanceTotals }[];
  product_count: number;
};
export type OpeningBalance = { amount_cents: string; occurred_at: string };
export const openingFormSchema = z.object({
  amount: z.string(),
  occurredLocal: z.string(),
  confirm: z.boolean(),
});
export type OpeningForm = z.infer<typeof openingFormSchema>;
const commandSchema = z.object({
  commandId: z.string().uuid(),
  payload: z.object({
    amount_cents: z.number().int().min(-1e11).max(1e11),
    occurred_local: z.string(),
    confirm: z.literal(true),
  }),
});
export type OpeningCommand = z.infer<typeof commandSchema>;
const openingDraftSchema = z.object({ form: openingFormSchema, pending: commandSchema.nullable() });
export function openingDraft(owner: string) {
  const r = openingDraftSchema.safeParse(readDraft(owner, "opening"));
  return r.success ? r.data : null;
}
export function signedInput(cents: string) {
  const n = BigInt(cents);
  const a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}${a / 100n},${String(a % 100n).padStart(2, "0")}`;
}
export function openingPayload(form: OpeningForm): OpeningCommand["payload"] {
  const value = form.amount.trim();
  const amount = priceInCents(value.startsWith("-") ? value.slice(1) : value);
  if (!form.confirm) throw new Error("Confirme que este saldo será somado às movimentações.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(form.occurredLocal))
    throw new Error("Informe a data e a hora do saldo inicial.");
  return {
    amount_cents: value.startsWith("-") ? -amount : amount,
    occurred_local: form.occurredLocal,
    confirm: true,
  };
}
// Only the chart height uses Number; monetary values remain exact strings/BigInt.
export function barHeights(values: string[]) {
  const amounts = values.map(BigInt);
  const max = amounts.reduce((m, n) => {
    const a = n < 0n ? -n : n;
    return a > m ? a : m;
  }, 0n);
  return amounts.map((n) => (max === 0n ? 0 : Number(((n < 0n ? -n : n) * 10000n) / max) / 100));
}
export function bucketLabel(key: string, mode: ReportMode) {
  if (mode === "day") return `${key.slice(11, 13)}h`;
  if (mode === "month") return key.slice(8, 10);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(
    new Date(`${key}:00Z`),
  );
}
