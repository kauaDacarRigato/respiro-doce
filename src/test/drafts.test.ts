import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDrafts, readDraft, saveDraft } from "@/lib/drafts";

describe("Rascunhos separados por conta", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it("não entrega o rascunho de uma conta para outra", () => {
    saveDraft("TESTE-A", "venda", { quantity: 2 });
    expect(readDraft("TESTE-A", "venda")).toEqual({ quantity: 2 });
    expect(readDraft("TESTE-B", "venda")).toBeNull();
  });
  it("expira rascunhos após 24 horas", () => {
    saveDraft("TESTE-A", "venda", { quantity: 2 });
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 25 * 60 * 60 * 1000);
    expect(readDraft("TESTE-A", "venda")).toBeNull();
  });
  it("bloqueia credenciais inclusive em objetos internos", () => {
    expect(() => saveDraft("TESTE-A", "venda", { senha: "TESTE" })).toThrow();
    expect(() => saveDraft("TESTE-A", "venda", { nested: { access_token: "TESTE" } })).toThrow();
  });
  it("limpa rascunhos sem apagar outros dados do navegador", () => {
    localStorage.setItem("outro-aplicativo", "manter");
    saveDraft("TESTE-A", "venda", { quantity: 2 });
    clearDrafts();
    expect(readDraft("TESTE-A", "venda")).toBeNull();
    expect(localStorage.getItem("outro-aplicativo")).toBe("manter");
  });
});
