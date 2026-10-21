import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeEditor, getRecipeDraft } from "@/features/products/recipe-editor";
import { MaterialCommandError } from "@/features/products/material-data";
const mocks = vi.hoisted(() => ({ send: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/features/products/recipe-data", () => ({
  sendRecipeCommand: mocks.send,
  selectedMaterials: vi.fn().mockResolvedValue([]),
  previewRecipe: vi.fn().mockResolvedValue({
    ready: false,
    reason: "Informe o rendimento",
    ingredients: "0",
    packaging: "0",
    direct: "0",
    indirect: "0",
    lot: "0",
    suggested_cents: null,
    unit_cost: null,
    raw_edible_g: null,
    components: [],
  }),
}));
describe("Rascunho e confirmação de receitas", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ status: "saved" });
  });
  afterEach(() => cleanup());
  function mount(online = true, restored = getRecipeDraft("TESTE") ?? undefined) {
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <RecipeEditor
          ownerId="TESTE"
          online={online}
          {...(restored ? { restored } : {})}
          onSaved={mocks.saved}
          onClose={mocks.close}
        />
      </QueryClientProvider>,
    );
  }
  function fill() {
    fireEvent.change(screen.getByLabelText("Nome da receita"), {
      target: { value: "TESTE Brigadeiro" },
    });
  }
  it("não confirma registro offline e preserva o rascunho", () => {
    mount(false);
    fill();
    expect(screen.getByRole("button", { name: "Salvar receita" })).toBeDisabled();
    expect(getRecipeDraft("TESTE")?.form.name).toBe("TESTE Brigadeiro");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("retoma envio com a mesma chave após fechar a tela com resposta desconhecida", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Conexão interrompida"));
    const view = mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar receita" }));
    await screen.findByText("Conexão interrompida");
    expect(screen.getByLabelText("Nome da receita")).toBeDisabled();
    const original = mocks.send.mock.calls[0]?.[0];
    expect(getRecipeDraft("TESTE")?.pending).toEqual(original);
    view.unmount();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledWith(false));
    expect(mocks.send.mock.calls[1]?.[0]).toEqual(original);
    expect(getRecipeDraft("TESTE")).toBeNull();
  });
  it("libera a correção depois de rejeição definitiva do banco", async () => {
    mocks.send.mockRejectedValue(new MaterialCommandError("Nome duplicado", true));
    mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar receita" }));
    await screen.findByText("Nome duplicado");
    expect(screen.getByLabelText("Nome da receita")).not.toBeDisabled();
    expect(getRecipeDraft("TESTE")?.pending).toBeNull();
  });
});
