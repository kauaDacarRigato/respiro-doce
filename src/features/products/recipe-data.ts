import { commandSignal } from "@/lib/account-requests";
import { getSupabase } from "@/lib/supabase";
import { MaterialCommandError, pageSize, type MaterialCommand } from "./material-data";
import { recipeError, type Recipe, type RecipePricing } from "./recipe-domain";
import type { Material } from "./material-domain";
export async function listRecipes(search: string, page: number, signal: AbortSignal) {
  const client = getSupabase();
  if (!client) throw new Error("Conexão indisponível.");
  let query = client
    .from("recipe_catalog")
    .select("*", { count: "exact" })
    .order("name")
    .order("id");
  if (search.trim())
    query = query.ilike(
      "name",
      `%${search
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[\\%_]/g, "\\$&")}%`,
    );
  const result = await query.range(page * pageSize, (page + 1) * pageSize - 1).abortSignal(signal);
  if (result.error)
    throw new Error(
      "Não foi possível carregar suas receitas. Confira a conexão e tente novamente.",
    );
  return { items: (result.data ?? []) as Recipe[], total: result.count ?? 0 };
}
export async function selectedMaterials(ids: string[], signal: AbortSignal) {
  const client = getSupabase();
  if (!client) throw new Error("Conexão indisponível.");
  if (!ids.length) return [];
  const result = await client.from("materials").select("*").in("id", ids).abortSignal(signal);
  if (result.error) throw new Error("Não foi possível atualizar os insumos selecionados.");
  return result.data as Material[];
}
export async function previewRecipe(payload: Record<string, unknown>, signal: AbortSignal) {
  const client = getSupabase();
  if (!client) throw new Error("Conexão indisponível.");
  const result = await client.rpc("recipe_preview", { p_data: payload }).abortSignal(signal);
  if (result.error) throw new Error(recipeError(result.error));
  return result.data as RecipePricing;
}
export async function sendRecipeCommand(command: MaterialCommand) {
  const client = getSupabase();
  if (!client) throw new Error("Conexão indisponível.");
  const result = await client
    .rpc("recipe_command", {
      p_command_id: command.commandId,
      p_action: command.action,
      p_recipe_id: command.id,
      p_data: command.payload,
    })
    .abortSignal(commandSignal());
  if (result.error)
    throw new MaterialCommandError(
      recipeError(result.error),
      /^(22|23|42501|P0002|PGRST301)/.test(result.error.code ?? ""),
    );
  return result.data as { id: string; status: "saved" | "gone" };
}
