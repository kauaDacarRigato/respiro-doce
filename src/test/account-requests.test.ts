import { afterEach, describe, expect, it, vi } from "vitest";
import { commandSignal, setRequestOwner } from "@/lib/account-requests";
describe("requisições ligadas ao dono autenticado", () => {
  afterEach(() => {
    setRequestOwner(null);
    vi.useRealTimers();
  });
  it("cancela comandos antigos ao trocar de dono, inclusive antes do fetch iniciar", () => {
    setRequestOwner("A");
    const old = commandSignal();
    setRequestOwner("B");
    expect(old.aborted).toBe(true);
    expect(commandSignal().aborted).toBe(false);
  });
  it("não interrompe comandos na renovação da mesma identidade e cancela na perda de sessão", () => {
    setRequestOwner("A");
    const command = commandSignal();
    setRequestOwner("A");
    expect(command.aborted).toBe(false);
    setRequestOwner(null);
    expect(command.aborted).toBe(true);
  });
});
