import { getSupabase } from "@/lib/supabase";
import type { Customer } from "@/features/sales/sale-domain";
import type { NutritionReport } from "@/features/nutrition/nutrition-domain";
const client = () => {
  const c = getSupabase();
  if (!c) throw new Error("Conexão indisponível.");
  return c;
};
export async function readNutrition(id: string, signal: AbortSignal) {
  const r = await client().rpc("recipe_nutrition", { p_recipe_id: id }).abortSignal(signal);
  if (r.error)
    throw new Error(
      r.error.code === "P0002"
        ? "Esta receita não está mais disponível."
        : "Não foi possível calcular a nutrição. Confira a conexão e tente novamente.",
    );
  return r.data as NutritionReport;
}
export async function readAccountExport(signal: AbortSignal) {
  const r = await client().rpc("account_export").abortSignal(signal);
  if (r.error)
    throw new Error(
      r.error.code === "54000"
        ? r.error.message
        : "Não foi possível gerar uma cópia completa. Confira sua conexão e tente novamente.",
    );
  return r.data as unknown;
}
export async function readCustomersExport(search: string, signal: AbortSignal) {
  const r = await client().rpc("customers_export", { p_search: search }).abortSignal(signal);
  if (r.error)
    throw new Error(
      r.error.code === "54000" ? r.error.message : "Não foi possível exportar os clientes.",
    );
  return r.data as { items: Customer[]; search: string; exported_at: string };
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
