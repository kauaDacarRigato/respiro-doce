import { describe, expect, it } from "vitest";
import { entryPayload, getEntryDraft, initialEntry } from "@/features/expenses/expense-domain";
import { saveDraft, clearDrafts } from "@/lib/drafts";
describe("Valores e rascunhos de gastos", () => {
  it("transforma vírgula decimal em centavos exatos sem aceitar zero/negativo/fração de centavo", () => {
    const form = { ...initialEntry(), description: "  TESTE   Gás  ", amount: "123,45" };
    expect(entryPayload("expense", form)).toMatchObject({
      description: "TESTE Gás",
      amount_cents: 12345,
      category_id: null,
    });
    for (const amount of ["0", "-1", "1,005", "1000000001"])
      expect(() => entryPayload("expense", { ...form, amount })).toThrow();
  });
  it("preserva os centavos ao editar e mantém data no relógio de São Paulo", () => {
    expect(
      initialEntry({
        id: "TESTE",
        description: "Gás",
        amount_cents: "12345",
        category_id: null,
        category_name: null,
        occurred_at: "2026-10-21T02:59:59Z",
      }),
    ).toMatchObject({ amount: "123,45", occurredLocal: "2026-10-20T23:59:59" });
  });
  it("normaliza nomes de categorias e rejeita categorias sem nome", () => {
    expect(
      entryPayload("expense_category", { ...initialEntry(), name: "  TESTE   Transporte " }),
    ).toEqual({ name: "TESTE Transporte" });
    expect(() => entryPayload("expense_category", initialEntry())).toThrow();
  });
  it("não retoma rascunho com operação de outra entidade ou de outro alvo", () => {
    clearDrafts();
    const id = "d7277158-4880-4475-b6c7-e89383b02fde";
    const draft = {
      id,
      entity: "expense",
      action: "create",
      form: initialEntry(),
      pending: {
        commandId: crypto.randomUUID(),
        entity: "expense_category",
        id,
        action: "create",
        payload: {},
      },
    };
    saveDraft("TESTE", "expense", draft);
    expect(getEntryDraft("TESTE", "expense")).toBeNull();
    clearDrafts();
  });
});
