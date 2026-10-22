import { z } from "zod";
import { priceInCents } from "@/features/products/material-domain";
import { saoPauloInput } from "@/features/sales/sale-domain";
import { readDraft } from "@/lib/drafts";
export type Category = { id: string; name: string };
export type Expense = {
  id: string;
  description: string;
  amount_cents: string;
  category_id: string | null;
  category_name: string | null;
  occurred_at: string;
};
export const entryFormSchema = z.object({
  name: z.string(),
  description: z.string(),
  amount: z.string(),
  categoryId: z.union([z.literal(""), z.string().uuid()]),
  occurredLocal: z.string(),
});
export type EntryForm = z.infer<typeof entryFormSchema>;
export type EntryEntity = "expense" | "expense_category";
export const expenseCommandSchema = z.object({
  commandId: z.string().uuid(),
  entity: z.enum(["expense", "expense_category"]),
  action: z.enum(["create", "update", "delete"]),
  id: z.string().uuid(),
  payload: z.record(z.unknown()),
});
export type ExpenseCommand = z.infer<typeof expenseCommandSchema>;
const draftSchema = z
  .object({
    id: z.string().uuid(),
    entity: z.enum(["expense", "expense_category"]),
    action: z.enum(["create", "update"]),
    form: entryFormSchema,
    pending: expenseCommandSchema.nullable(),
  })
  .refine(
    (d) =>
      !d.pending ||
      (d.pending.id === d.id && d.pending.entity === d.entity && d.pending.action === d.action),
  );
export type EntryDraft = z.infer<typeof draftSchema>;
export function getEntryDraft(owner: string, entity: EntryEntity): EntryDraft | null {
  const r = draftSchema.safeParse(readDraft(owner, entity));
  return r.success && r.data.entity === entity ? r.data : null;
}
export function initialEntry(item?: Expense | Category): EntryForm {
  const expense = item && "description" in item ? item : null;
  return {
    name: item && "name" in item ? item.name : "",
    description: expense?.description ?? "",
    amount: expense
      ? `${BigInt(expense.amount_cents) / 100n},${(BigInt(expense.amount_cents) % 100n).toString().padStart(2, "0")}`
      : "",
    categoryId: expense?.category_id ?? "",
    occurredLocal: saoPauloInput(expense ? new Date(expense.occurred_at) : new Date()),
  };
}
export function entryPayload(entity: EntryEntity, form: EntryForm) {
  if (!entryFormSchema.safeParse(form).success)
    throw new Error("Confira os campos e a categoria selecionada.");
  if (entity === "expense_category") {
    const name = form.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 100)
      throw new Error("Informe o nome da categoria com até 100 caracteres.");
    return { name };
  }
  const description = form.description.trim().replace(/\s+/g, " ");
  if (!description || description.length > 200)
    throw new Error("Informe uma descrição com até 200 caracteres.");
  const amount = priceInCents(form.amount);
  if (amount <= 0) throw new Error("O valor do gasto deve ser maior que zero.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(form.occurredLocal))
    throw new Error("Informe a data e a hora do gasto.");
  return {
    description,
    amount_cents: amount,
    category_id: form.categoryId || null,
    occurred_local: form.occurredLocal,
  };
}
export function expenseError(error: { code?: string; message?: string }) {
  if (error.code === "23505")
    return "Já existe uma categoria com esse nome. Use outro nome ou edite a existente.";
  if (error.code === "P0002")
    return "Gasto ou categoria indisponível. Atualize a lista; escolha outra categoria ou Sem categoria.";
  if (error.code === "42501" || error.code === "PGRST301")
    return "Seu acesso expirou. Entre novamente; seu rascunho está preservado.";
  if (error.code?.startsWith("22"))
    return error.message?.slice(0, 220) ?? "Confira os dados informados.";
  if (error.code?.startsWith("23")) return "Confira o valor, a descrição, a data e a categoria.";
  return "Não foi possível confirmar a operação. Confira a conexão e tente novamente com os mesmos dados.";
}
