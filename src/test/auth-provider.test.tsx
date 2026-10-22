import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/features/auth/auth-provider";
import { readDraft, saveDraft } from "@/lib/drafts";

const mocks = vi.hoisted(() => ({
  listener: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (callback: typeof mocks.listener) => {
        mocks.listener = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      },
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: mocks.signOut,
    },
  }),
}));

function actor(id: string) {
  return { user: { id } } as Session;
}
function Probe() {
  const auth = useAuth();
  const [draft, setDraft] = useState("");
  return (
    <>
      <input
        aria-label="Formulário privado"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <span data-testid="owner">{auth.session?.user.id ?? "sem acesso"}</span>
      <span data-testid="recovery">{String(auth.recovery)}</span>
      <button
        onClick={() => {
          void auth.signOut();
        }}
      >
        Sair
      </button>
      <button onClick={auth.finishRecovery}>Concluir recuperação</button>
      {auth.error && <p role="alert">{auth.error}</p>}
    </>
  );
}
function mount() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}
function emit(event: AuthChangeEvent, session: Session | null) {
  act(() => mocks.listener?.(event, session));
}

describe("Ciclo de autenticação e troca de conta", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });
  afterEach(cleanup);
  it("limpa dados em cache e rascunhos ao trocar de conta", () => {
    const cache = mount();
    emit("SIGNED_IN", actor("TESTE-A"));
    cache.setQueryData(["privado", "TESTE-A"], "TESTE privado");
    saveDraft("TESTE-A", "venda", { quantity: 3 });
    emit("SIGNED_IN", actor("TESTE-B"));
    expect(cache.getQueryData(["privado", "TESTE-A"])).toBeUndefined();
    expect(readDraft("TESTE-A", "venda")).toBeNull();
    expect(screen.getByTestId("owner")).toHaveTextContent("TESTE-B");
  });
  it("preserva rascunho na expiração e só libera após novo login", () => {
    const cache = mount();
    emit("SIGNED_IN", actor("TESTE-A"));
    saveDraft("TESTE-A", "venda", { quantity: 3 });
    cache.setQueryData(["privado"], "TESTE");
    emit("SIGNED_OUT", null);
    expect(screen.getByTestId("owner")).toHaveTextContent("sem acesso");
    expect(cache.getQueryData(["privado"])).toBeUndefined();
    emit("SIGNED_IN", actor("TESTE-A"));
    expect(readDraft("TESTE-A", "venda")).toEqual({ quantity: 3 });
  });
  it("reinicia formulários na troca direta de dono e preserva estado na renovação", () => {
    mount();
    emit("SIGNED_IN", actor("TESTE-A"));
    fireEvent.change(screen.getByLabelText("Formulário privado"), {
      target: { value: "dados de A" },
    });
    emit("TOKEN_REFRESHED", actor("TESTE-A"));
    expect(screen.getByLabelText("Formulário privado")).toHaveValue("dados de A");
    emit("SIGNED_IN", actor("TESTE-B"));
    expect(screen.getByLabelText("Formulário privado")).toHaveValue("");
  });
  it("remove rascunhos de outros donos mesmo após reiniciar o navegador", () => {
    saveDraft("TESTE-A", "venda", { quantity: 3 });
    saveDraft("TESTE-B", "venda", { quantity: 2 });
    mount();
    emit("INITIAL_SESSION", actor("TESTE-B"));
    expect(readDraft("TESTE-A", "venda")).toBeNull();
    expect(readDraft("TESTE-B", "venda")).toEqual({ quantity: 2 });
  });
  it("logout explícito limpa os rascunhos", async () => {
    mount();
    emit("SIGNED_IN", actor("TESTE-A"));
    saveDraft("TESTE-A", "venda", { quantity: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(screen.getByTestId("owner")).toHaveTextContent("sem acesso"));
    expect(readDraft("TESTE-A", "venda")).toBeNull();
  });
  it("completa limpeza local quando o SDK saiu apesar da falha de revogação", async () => {
    mount();
    emit("SIGNED_IN", actor("TESTE-A"));
    saveDraft("TESTE-A", "venda", { quantity: 3 });
    mocks.signOut.mockImplementationOnce(async () => {
      mocks.listener?.("SIGNED_OUT", null);
      return { error: new Error("rede indisponível") };
    });
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await waitFor(() => expect(readDraft("TESTE-A", "venda")).toBeNull());
    expect(screen.getByTestId("owner")).toHaveTextContent("sem acesso");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("mantém dados quando o logout falhou e o SDK continua autenticado", async () => {
    mount();
    emit("SIGNED_IN", actor("TESTE-A"));
    saveDraft("TESTE-A", "venda", { quantity: 3 });
    mocks.signOut.mockResolvedValueOnce({ error: new Error("falha") });
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    await screen.findByRole("alert");
    expect(screen.getByTestId("owner")).toHaveTextContent("TESTE-A");
    expect(readDraft("TESTE-A", "venda")).toEqual({ quantity: 3 });
  });
  it("mantém recuperação durante renovação do token e encerra após salvar", () => {
    mount();
    emit("PASSWORD_RECOVERY", actor("TESTE-A"));
    emit("TOKEN_REFRESHED", actor("TESTE-A"));
    expect(screen.getByTestId("recovery")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("button", { name: "Concluir recuperação" }));
    expect(sessionStorage.getItem("respiro-doce:recovery")).toBeNull();
    expect(screen.getByTestId("recovery")).toHaveTextContent("false");
  });
  it("restaura o modo de recuperação após recarregar a mesma conta", () => {
    sessionStorage.setItem("respiro-doce:recovery", "TESTE-A");
    mount();
    emit("INITIAL_SESSION", actor("TESTE-A"));
    expect(screen.getByTestId("recovery")).toHaveTextContent("true");
  });
});
