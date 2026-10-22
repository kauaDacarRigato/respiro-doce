import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaleEditor } from "@/features/sales/sale-editor";
import { emptySaleForm } from "@/features/sales/sale-domain";
import { getSaleDraft } from "@/features/sales/sale-draft";
import { MaterialCommandError } from "@/features/products/material-data";
const mocks = vi.hoisted(() => ({ send: vi.fn(), quote: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/features/sales/sale-data", () => ({
  sendCommerceCommand: mocks.send,
  quoteSale: mocks.quote,
  listCustomers: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
const quote = {
  signature: "TESTE-assinatura",
  product_name: "TESTE Brigadeiro",
  historical: false,
  unit_cost: "3.84",
  debit_fee_percent: "2",
  credit_fee_percent: "5.49",
  applied_fee_percent: "0",
  gross_cents: "1000",
  production_cents: "384",
  fee_cents: "0",
  total_cost_cents: "384",
  net_cents: "1000",
  profit_cents: "616",
};
describe("Confirmação, prejuízo e retomada da venda", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ status: "saved" });
    mocks.quote.mockResolvedValue(quote);
  });
  afterEach(() => cleanup());
  function mount(online = true) {
    const restored = getSaleDraft("TESTE") ?? {
      id: "d7277158-4880-4475-b6c7-e89383b02fde",
      originalRecipeId: null,
      action: "create" as const,
      form: {
        ...emptySaleForm(),
        recipeId: "aa0cb06e-043d-4612-ade4-65f7128890ac",
        price: "10,00",
      },
      pending: null,
    };
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SaleEditor
          ownerId="TESTE"
          restored={restored}
          online={online}
          onSaved={mocks.saved}
          onClose={mocks.close}
        />
      </QueryClientProvider>,
    );
  }
  it("preserva rascunho sem confirmar nada offline", () => {
    mount(false);
    expect(screen.getByRole("button", { name: "Salvar venda" })).toBeDisabled();
    expect(getSaleDraft("TESTE")).not.toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("repete o mesmo pedido após resposta desconhecida, inclusive depois de reabrir", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Conexão interrompida"));
    const view = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar venda" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Salvar venda" }));
    await screen.findByText("Conexão interrompida");
    expect(screen.getByLabelText("Quantidade vendida")).toBeDisabled();
    const original = mocks.send.mock.calls[0]![0];
    view.unmount();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledWith(false));
    expect(mocks.send.mock.calls[1]![0]).toEqual(original);
    expect(getSaleDraft("TESTE")).toBeNull();
  });
  it("exige confirmar o prejuízo, incluindo uma venda gratuita", async () => {
    mocks.quote.mockResolvedValue({
      ...quote,
      gross_cents: "0",
      net_cents: "0",
      profit_cents: "-384",
    });
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar venda" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Salvar venda" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirme o prejuízo");
    expect(mocks.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Confirmo esta venda com prejuízo/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar venda" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Salvar venda" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalled());
    expect(mocks.send.mock.calls[0]![0].payload.confirm_loss).toBe(true);
  });
  it("libera campos quando o servidor rejeita a operação", async () => {
    mocks.send.mockRejectedValue(new MaterialCommandError("Os valores mudaram", true));
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar venda" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Salvar venda" }));
    await screen.findByText("Os valores mudaram");
    expect(screen.getByLabelText("Quantidade vendida")).not.toBeDisabled();
    expect(getSaleDraft("TESTE")?.pending).toBeNull();
  });
});
