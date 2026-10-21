import { describe, expect, it } from "vitest";
import { authMessage, readAuthConfig } from "@/lib/auth-config";

describe("Configuração de acesso", () => {
  it("recusa configuração incompleta", () => {
    expect(readAuthConfig({})).toBeNull();
    expect(readAuthConfig({ VITE_SUPABASE_URL: "https://teste.supabase.co" })).toBeNull();
  });
  it("recusa chave secreta, domínio inesperado ou conexão sem HTTPS", () => {
    for (const [url, key] of [
      ["https://teste.supabase.co", "sb_secret_nao_publicar"],
      ["https://supabase.co.atacante.com", "sb_publishable_TESTE"],
      ["http://teste.supabase.co", "sb_publishable_TESTE"],
    ]) {
      expect(
        readAuthConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
      ).toBeNull();
    }
  });
  it("aceita o par público de um projeto", () => {
    expect(
      readAuthConfig({
        VITE_SUPABASE_URL: "https://teste.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_TESTE",
      }),
    ).toEqual({ url: "https://teste.supabase.co", key: "sb_publishable_TESTE" });
  });
  it("não revela mensagens internas de autenticação", () => {
    expect(authMessage({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
    expect(authMessage({ code: "user_does_not_exist" })).not.toContain("user_does_not_exist");
    expect(authMessage({ status: 429 })).toContain("Muitas tentativas");
  });
});
