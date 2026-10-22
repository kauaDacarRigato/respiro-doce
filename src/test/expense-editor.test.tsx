import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntryEditor } from "@/features/expenses/entry-editor";
import { getEntryDraft, type EntryEntity } from "@/features/expenses/expense-domain";
import { MaterialCommandError } from "@/features/products/material-data";
const mocks = vi.hoisted(() => ({ send: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/features/expenses/expense-data", () => ({
  sendExpenseCommand: mocks.send,
  listCategories: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  readCategory: vi.fn().mockResolvedValue(null),
  categoryPageSize: 30,
}));
describe("Confirmação e retomada de gastos/categorias", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ status: "saved" });
  });
  afterEach(() => cleanup());
  function mount(online = true, entity: EntryEntity = "expense") {
    const restored = getEntryDraft("TESTE", entity);
    return render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <EntryEditor
          owner="TESTE"
          entity={entity}
          {...(restored ? { restored } : {})}
          online={online}
          onSaved={mocks.saved}
          onClose={mocks.close}
        />
      </QueryClientProvider>,
    );
  }
  function fill() {
    fireEvent.change(screen.getByLabelText("Descrição do gasto"), {
      target: { value: "TESTE Gás" },
    });
    fireEvent.change(screen.getByLabelText("Valor pago (R$)"), { target: { value: "123,45" } });
  }
  it("só confirma salvamento depois da resposta e então remove o rascunho", async () => {
    mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar gasto" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledWith(false));
    expect(mocks.send.mock.calls[0]![0].payload.amount_cents).toBe(12345);
    expect(getEntryDraft("TESTE", "expense")).toBeNull();
  });
  it("preserva digitação sem enviar ou confirmar gasto offline", () => {
    mount(false);
    fill();
    expect(screen.getByRole("button", { name: "Salvar gasto" })).toBeDisabled();
    expect(getEntryDraft("TESTE", "expense")?.form.description).toBe("TESTE Gás");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("repete exatamente a mesma operação após erro desconhecido, inclusive depois de reabrir", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Conexão interrompida"));
    const view = mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar gasto" }));
    await screen.findByText("Conexão interrompida");
    expect(screen.getByLabelText("Valor pago (R$)")).toBeDisabled();
    const command = mocks.send.mock.calls[0]![0];
    view.unmount();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalled());
    expect(mocks.send.mock.calls[1]![0]).toEqual(command);
  });
  it("libera correção da categoria quando o servidor rejeitou nome repetido", async () => {
    mocks.send.mockRejectedValue(new MaterialCommandError("Nome já utilizado", true));
    mount(true, "expense_category");
    fireEvent.change(screen.getByLabelText("Nome da categoria"), {
      target: { value: "TESTE Categoria" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar categoria" }));
    await screen.findByText("Nome já utilizado");
    expect(screen.getByLabelText("Nome da categoria")).not.toBeDisabled();
    expect(getEntryDraft("TESTE", "expense_category")?.pending).toBeNull();
  });
});
