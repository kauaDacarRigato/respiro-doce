import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaterialEditor, getMaterialDraft } from "@/features/products/material-editor";
import { MaterialCommandError } from "@/features/products/material-data";

const mocks = vi.hoisted(() => ({ send: vi.fn(), saved: vi.fn(), close: vi.fn() }));
vi.mock("@/features/products/material-data", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/products/material-data")>();
  return { ...original, sendMaterialCommand: mocks.send };
});
describe("Cadastro, rascunho e retomada de envio", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ status: "saved" });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  function mount(online = true) {
    render(
      <MaterialEditor
        ownerId="TESTE"
        online={online}
        onSaved={mocks.saved}
        onClose={mocks.close}
      />,
    );
  }
  function fill() {
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "TESTE Farinha" } });
    fireEvent.change(screen.getByLabelText("Quantidade da embalagem"), {
      target: { value: "1000" },
    });
    fireEvent.change(screen.getByLabelText("Preço pago (R$)"), { target: { value: "8,90" } });
  }
  it("salva o preço em centavos e remove o rascunho somente após confirmação", async () => {
    mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalledWith(false));
    expect(mocks.send.mock.calls[0]?.[0].payload.package_price_cents).toBe(890);
    expect(getMaterialDraft("TESTE")).toBeNull();
  });
  it("guarda digitação sem confirmar registro offline", () => {
    mount(false);
    fill();
    expect(screen.getByRole("button", { name: "Salvar cadastro" })).toBeDisabled();
    expect(getMaterialDraft("TESTE")?.form.name).toBe("TESTE Farinha");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("avisa quando o navegador não consegue preservar o rascunho", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Armazenamento bloqueado");
    });
    mount(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("não conseguiu guardar o rascunho");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("repete a mesma operação após erro de rede, com campos bloqueados", async () => {
    mocks.send.mockRejectedValueOnce(new Error("Conexão interrompida"));
    mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await screen.findByText("Conexão interrompida");
    expect(screen.getByLabelText("Nome")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(mocks.saved).toHaveBeenCalled());
    expect(mocks.send.mock.calls[0]?.[0]).toEqual(mocks.send.mock.calls[1]?.[0]);
  });
  it("permite corrigir os dados quando o servidor rejeitou a operação", async () => {
    mocks.send.mockRejectedValue(new MaterialCommandError("Nome duplicado", true));
    mount();
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Salvar cadastro" }));
    await screen.findByText("Nome duplicado");
    expect(screen.getByLabelText("Nome")).not.toBeDisabled();
    expect(getMaterialDraft("TESTE")?.pending).toBeNull();
  });
});
