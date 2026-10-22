import { afterEach, describe, expect, it, vi } from "vitest";
import { requestFetch } from "@/lib/request-fetch";
describe("transporte com prazo e cancelamento", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("interrompe uma requisição travada sem reenviar a escrita", async () => {
    vi.useFakeTimers();
    const network = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(init.signal.reason)),
        ),
    );
    vi.stubGlobal("fetch", network);
    const result = requestFetch("https://example.invalid", { method: "POST" }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await result).name).toBe("TimeoutError");
    expect(network).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("propaga cancelamento de leitura e limpa o prazo após sucesso", async () => {
    vi.useFakeTimers();
    const response = {} as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const upstream = new AbortController();
    upstream.abort();
    expect(await requestFetch("https://example.invalid", { signal: upstream.signal })).toBe(
      response,
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("propaga o cancelamento do dono enquanto o transporte está aguardando", async () => {
    vi.useFakeTimers();
    const upstream = new AbortController();
    const network = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new Error("cancelado"))),
        ),
    );
    vi.stubGlobal("fetch", network);
    const result = requestFetch("https://example.invalid", { signal: upstream.signal }).catch(
      (e) => e,
    );
    upstream.abort();
    expect((await result).message).toBe("cancelado");
    expect(network).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
