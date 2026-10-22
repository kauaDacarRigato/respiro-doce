import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpeningEditor } from "@/features/cash/opening-editor";
import { openingDraft } from "@/features/cash/finance-domain";
import { MaterialCommandError } from "@/features/products/material-data";
const mocks = vi.hoisted(() => ({ send: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/features/cash/finance-data", () => ({ sendOpening: mocks.send }));
describe("confirmação do saldo inicial", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.send.mockResolvedValue(undefined);
  });
  afterEach(cleanup);
  const mount = (online = true) =>
    render(
      <OpeningEditor
        owner="TESTE"
        opening={{ amount_cents: "0", occurred_at: "2026-10-01T03:00:00Z" }}
        online={online}
        onClose={mocks.close}
        onSaved={mocks.saved}
      />,
    );
  function fill() {
    fireEvent.change(screen.getByLabelText("Valor inicial (R$)"), { target: { value: "-123,45" } });
    fireEvent.click(screen.getByRole("checkbox"));
  }
  it("exige confirmação antes de enviar e confirma apenas após resposta", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Salvar saldo inicial" }));
    await screen.findByRole("alert");
    expect(mocks.send).not.toHaveBeenCalled();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar saldo inicial" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalled());
    expect(mocks.send.mock.calls[0]![0].payload.amount_cents).toBe(-12345);
    expect(openingDraft("TESTE")).toBeNull();
  });
  it("preserva rascunho sem enviar offline", () => {
    mount(false);
    fill();
    expect(screen.getByRole("button", { name: "Salvar saldo inicial" })).toBeDisabled();
    expect(openingDraft("TESTE")?.form.amount).toBe("-123,45");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("retoma exatamente a mesma operação após uma resposta desconhecida", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Conexão interrompida"));
    const view = mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar saldo inicial" }));
    await screen.findByText("Conexão interrompida");
    expect(screen.getByLabelText("Valor inicial (R$)")).toBeDisabled();
    expect(mocks.saved).not.toHaveBeenCalled();
    const command = mocks.send.mock.calls[0]![0];
    view.unmount();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalled());
    expect(mocks.send.mock.calls[1]![0]).toEqual(command);
  });
  it("libera correção após rejeição definitiva", async () => {
    mocks.send.mockRejectedValueOnce(new MaterialCommandError("Data inválida", true));
    mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar saldo inicial" }));
    await screen.findByText("Data inválida");
    expect(screen.getByLabelText("Valor inicial (R$)")).not.toBeDisabled();
    expect(openingDraft("TESTE")?.pending).toBeNull();
    expect(mocks.saved).not.toHaveBeenCalled();
  });
});
