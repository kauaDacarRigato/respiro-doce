import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessScreen } from "@/features/auth/access-screen";

const mocks = vi.hoisted(() => ({
  auth: { configured: true, recovery: false, finishRecovery: vi.fn(), error: "" },
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: mocks }) }));

describe("Formulários de acesso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.configured = true;
    mocks.auth.recovery = false;
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signUp.mockResolvedValue({ error: null, data: { session: null } });
  });
  afterEach(cleanup);
  it("envia credenciais sem guardá-las em rascunhos", async () => {
    render(<AccessScreen />);
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "TESTE@example.invalid" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "TESTE-senha-segura" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() =>
      expect(mocks.signInWithPassword).toHaveBeenCalledWith({
        email: "TESTE@example.invalid",
        password: "TESTE-senha-segura",
      }),
    );
    expect(localStorage.length).toBe(0);
  });
  it("mostra erro legível para credenciais inválidas", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" } });
    render(<AccessScreen />);
    fireEvent.submit(screen.getByRole("button", { name: "Entrar" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("E-mail ou senha incorretos.");
  });
  it("recuperação não confirma a existência de uma conta", async () => {
    render(<AccessScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "TESTE@example.invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar instruções" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Se houver uma conta");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("TESTE@example.invalid", {
      redirectTo: `${window.location.origin}/`,
    });
  });
  it("bloqueia senhas diferentes na recuperação", async () => {
    mocks.auth.recovery = true;
    render(<AccessScreen />);
    fireEvent.change(screen.getByLabelText("Nova senha"), {
      target: { value: "TESTE-senha-segura" },
    });
    fireEvent.change(screen.getByLabelText("Confirme a senha"), {
      target: { value: "TESTE-senha-diferente" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("As senhas precisam ser iguais");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("atualiza a senha e encerra o fluxo de recuperação", async () => {
    mocks.auth.recovery = true;
    render(<AccessScreen />);
    for (const label of ["Nova senha", "Confirme a senha"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "TESTE-senha-segura" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
    await waitFor(() => expect(mocks.auth.finishRecovery).toHaveBeenCalled());
  });
  it("não libera acesso sem configuração válida", () => {
    mocks.auth.configured = false;
    render(<AccessScreen />);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
  });
});
