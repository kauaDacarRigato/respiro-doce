import { commandSignal } from "@/lib/account-requests";
import { getSupabase } from "@/lib/supabase";
import { materialError, type Material, type MaterialKind, type Nutrition } from "./material-domain";
export const pageSize = 30;

export async function listMaterials(
  search: string,
  kind: MaterialKind | "all",
  page: number,
  signal: AbortSignal,
) {
  const client = getSupabase();
  if (!client) throw new Error("Conexão indisponível.");
  let query = client
    .from("materials")
    .select("*, nutrition:material_nutrition(*)", { count: "exact" })
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
  if (kind !== "all") query = query.eq("kind", kind);
  const result = await query.range(page * pageSize, (page + 1) * pageSize - 1).abortSignal(signal);
  if (result.error)
    throw new Error(
      "Não foi possível carregar seus cadastros. Confira a conexão e tente novamente.",
    );
  const items = (result.data ?? []).map((row) => ({
    ...row,
    nutrition: Array.isArray(row["nutrition"]) ? (row["nutrition"][0] ?? null) : row["nutrition"],
  })) as (Material & { nutrition: Nutrition | null })[];
  return { items, total: result.count ?? 0 };
}
export type MaterialCommand = {
  commandId: string;
  action: "create" | "update" | "delete";
  id: string;
  payload: Record<string, unknown>;
};
export class MaterialCommandError extends Error {
  constructor(
    message: string,
    public definitive: boolean,
  ) {
    super(message);
  }
}
export async function sendMaterialCommand(command: MaterialCommand) {
  const client = getSupabase();
  if (!client) throw new Error("Conexão indisponível.");
  const result = await client
    .rpc("material_command", {
      p_command_id: command.commandId,
      p_action: command.action,
      p_material_id: command.id,
      p_data: command.payload,
    })
    .abortSignal(commandSignal());
  if (result.error)
    throw new MaterialCommandError(
      materialError(result.error),
      /^(22|23|42501|P0002|PGRST301)/.test(result.error.code ?? ""),
    );
  return result.data as { id: string; status: "saved" | "gone" };
}
