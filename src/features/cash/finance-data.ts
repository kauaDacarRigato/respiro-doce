import { commandSignal } from "@/lib/account-requests";
import { getSupabase } from "@/lib/supabase";
import { MaterialCommandError } from "@/features/products/material-data";
import { expenseError } from "@/features/expenses/expense-domain";
import type {
  CashResult,
  FinancialReport,
  OpeningBalance,
  OpeningCommand,
  ReportMode,
} from "./finance-domain";
const client = () => {
  const c = getSupabase();
  if (!c) throw new Error("Conexão indisponível.");
  return c;
};
export async function readCash(
  from: string,
  to: string,
  kind: string,
  category: string,
  page: number,
  signal: AbortSignal,
) {
  const r = await client()
    .rpc("cash_list", {
      p_from: from || null,
      p_to: to || null,
      p_kind: kind,
      p_category: category,
      p_page: page,
    })
    .abortSignal(signal);
  if (r.error)
    throw new Error("Não foi possível carregar o caixa. Confira a conexão e tente novamente.");
  return r.data as CashResult;
}
export async function readReport(
  mode: ReportMode,
  anchor: string,
  page: number,
  signal: AbortSignal,
) {
  const r = await client()
    .rpc("financial_report", { p_mode: mode, p_anchor: anchor, p_product_page: page })
    .abortSignal(signal);
  if (r.error)
    throw new Error("Não foi possível carregar o resumo. Confira a conexão e tente novamente.");
  return r.data as FinancialReport;
}
export async function readOpening(signal: AbortSignal) {
  const r = await client().rpc("opening_balance").abortSignal(signal);
  if (r.error) throw new Error("Não foi possível conferir o saldo inicial.");
  return r.data as OpeningBalance;
}
export async function sendOpening(command: OpeningCommand) {
  const r = await client()
    .rpc("opening_balance_command", { p_command_id: command.commandId, p_data: command.payload })
    .abortSignal(commandSignal());
  if (r.error)
    throw new MaterialCommandError(
      expenseError(r.error),
      /^(22|23|42501|PGRST301)/.test(r.error.code ?? ""),
    );
}
