import { getSupabase } from "@/lib/supabase";
import { MaterialCommandError } from "@/features/products/material-data";
import { expenseError, type Category, type Expense, type ExpenseCommand } from "./expense-domain";
export const expensePageSize = 20;
export const categoryPageSize = 30;
const client = () => {
  const c = getSupabase();
  if (!c) throw new Error("Conexão indisponível.");
  return c;
};
export async function sendExpenseCommand(command: ExpenseCommand) {
  const r = await client()
    .rpc("expense_command", {
      p_command_id: command.commandId,
      p_entity: command.entity,
      p_action: command.action,
      p_target_id: command.id,
      p_data: command.payload,
    })
    .abortSignal(AbortSignal.timeout(20000));
  if (r.error)
    throw new MaterialCommandError(
      expenseError(r.error),
      /^(22|23|42501|P0002|PGRST301)/.test(r.error.code ?? ""),
    );
  return r.data as { id: string; status: "saved" | "gone" };
}
export async function listExpenses(
  from: string,
  to: string,
  category: string,
  search: string,
  page: number,
  signal: AbortSignal,
) {
  const r = await client()
    .rpc("expense_list", {
      p_from: from || null,
      p_to: to || null,
      p_category: category,
      p_search: search.trim().replace(/\s+/g, " "),
      p_page: page,
    })
    .abortSignal(signal);
  if (r.error)
    throw new Error("Não foi possível carregar os gastos. Confira a conexão e tente novamente.");
  return r.data as { items: Expense[]; total: number; total_cents: string };
}
export async function listCategories(search: string, page: number, signal: AbortSignal) {
  let q = client()
    .from("expense_categories")
    .select("id,name", { count: "exact" })
    .order("name")
    .order("id");
  if (search.trim())
    q = q.ilike(
      "name",
      `%${search
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[\\%_]/g, "\\$&")}%`,
    );
  const r = await q
    .range(page * categoryPageSize, (page + 1) * categoryPageSize - 1)
    .abortSignal(signal);
  if (r.error) throw new Error("Não foi possível carregar as categorias.");
  return { items: (r.data ?? []) as Category[], total: r.count ?? 0 };
}
export async function readCategory(id: string, signal: AbortSignal) {
  const r = await client()
    .from("expense_categories")
    .select("id,name")
    .eq("id", id)
    .abortSignal(signal)
    .maybeSingle();
  if (r.error) throw new Error("Não foi possível conferir a categoria selecionada.");
  return r.data as Category | null;
}
