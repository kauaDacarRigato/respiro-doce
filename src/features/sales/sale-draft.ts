import { z } from "zod";
import { readDraft } from "@/lib/drafts";
import { saleFormSchema, type SaleForm } from "./sale-domain";
import type { CommerceCommand } from "./sale-data";
export const commandSchema = z.object({
  commandId: z.string().uuid(),
  entity: z.enum(["sale", "customer", "fees"]),
  action: z.enum(["create", "update", "delete"]),
  id: z.string().uuid(),
  payload: z.record(z.unknown()),
});
export type SaleDraft = {
  id: string;
  originalRecipeId: string | null;
  action: "create" | "update";
  form: SaleForm;
  pending: CommerceCommand | null;
};
const schema = z.object({
  id: z.string().uuid(),
  originalRecipeId: z.string().uuid().nullable(),
  action: z.enum(["create", "update"]),
  form: saleFormSchema,
  pending: commandSchema.nullable(),
});
export function getSaleDraft(owner: string): SaleDraft | null {
  const result = schema.safeParse(readDraft(owner, "sale"));
  return result.success ? result.data : null;
}
