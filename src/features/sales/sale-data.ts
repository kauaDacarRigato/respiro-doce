import { commandSignal } from "@/lib/account-requests";
import { getSupabase } from "@/lib/supabase";
import { MaterialCommandError } from "@/features/products/material-data";
import { commerceError, type Customer, type Sale, type SaleQuote } from "./sale-domain";
export const salesPageSize = 20;
export type CommerceCommand = {
  commandId: string;
  entity: "sale" | "customer" | "fees";
  action: "create" | "update" | "delete";
  id: string;
  payload: Record<string, unknown>;
};
function client() {
  const value = getSupabase();
  if (!value) throw new Error("Conexão indisponível.");
  return value;
}
export async function sendCommerceCommand(command: CommerceCommand) {
  const r = await client()
    .rpc("commerce_command", {
      p_command_id: command.commandId,
      p_entity: command.entity,
      p_action: command.action,
      p_target_id: command.id,
      p_data: command.payload,
    })
    .abortSignal(commandSignal());
  if (r.error)
    throw new MaterialCommandError(
      commerceError(r.error),
      /^(22|23|42501|P0002|P0003|PGRST301)/.test(r.error.code ?? ""),
    );
  return r.data as { id: string; status: "saved" | "gone" };
}
export async function quoteSale(
  id: string | null,
  payload: Record<string, unknown>,
  signal: AbortSignal,
) {
  const r = await client()
    .rpc("sale_preview", { p_sale_id: id, p_data: payload })
    .abortSignal(signal);
  if (r.error) throw new Error(commerceError(r.error));
  return r.data as SaleQuote;
}
export async function listSales(
  from: string,
  to: string,
  payment: string,
  page: number,
  signal: AbortSignal,
  customerId?: string,
) {
  let q = client()
    .rpc("sales_period", { p_from: from || null, p_to: to || null }, { count: "exact" })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
  if (payment !== "all") q = q.eq("payment", payment);
  if (customerId) q = q.eq("customer_id", customerId);
  const r = await q.range(page * salesPageSize, (page + 1) * salesPageSize - 1).abortSignal(signal);
  if (r.error) throw new Error("Não foi possível carregar as vendas. Confira a conexão.");
  return { items: (r.data ?? []) as Sale[], total: r.count ?? 0 };
}
export async function listCustomers(search: string, page: number, signal: AbortSignal) {
  let q = client()
    .from("customer_catalog")
    .select("*", { count: "exact" })
    .order("name")
    .order("id");
  const term = search.trim().replace(/[\\%_]/g, "\\$&");
  if (term) {
    if (/^[+\d ().-]+$/.test(term)) q = q.ilike("phone", `%${term.replace(/\D/g, "")}%`);
    else q = q.ilike("name", `%${term}%`);
  }
  const r = await q.range(page * salesPageSize, (page + 1) * salesPageSize - 1).abortSignal(signal);
  if (r.error) throw new Error("Não foi possível carregar os clientes.");
  return { items: (r.data ?? []) as Customer[], total: r.count ?? 0 };
}
export async function readFees(signal: AbortSignal) {
  const r = await client()
    .from("business_settings")
    .select("debit_fee_percent,credit_fee_percent")
    .abortSignal(signal)
    .single();
  if (r.error) throw new Error("Não foi possível carregar as taxas.");
  return r.data as { debit_fee_percent: number; credit_fee_percent: number };
}
