// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
const source = readFileSync(new URL("../../pwa/sw.template.js", import.meta.url), "utf8");
function worker() {
  const handlers = new Map<string, (event: object) => void>();
  const cache = { addAll: vi.fn().mockResolvedValue(undefined) };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn().mockResolvedValue(new Response("offline")),
    keys: vi.fn().mockResolvedValue(["respiro-doce-public-old", "another-app"]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (name: string, fn: (event: object) => void) => handlers.set(name, fn),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue([{ id: "tab1" }]),
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
  };
  const fetch = vi.fn().mockResolvedValue(new Response("server"));
  runInNewContext(source, { self, caches, fetch, URL, Response });
  return { handlers, self, caches, cache, fetch };
}
describe("política do service worker", () => {
  it("pré-carrega apenas arquivos públicos e limpa somente seus próprios caches antigos", async () => {
    const w = worker();
    let task!: Promise<void>;
    w.handlers.get("install")!({
      waitUntil: (p: Promise<void>) => {
        task = p;
      },
    });
    await task;
    expect(w.cache.addAll.mock.calls[0]![0]).toEqual([
      "/offline.html",
      "/icons/app.svg",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
      "/icons/apple-touch-icon.png",
    ]);
    w.handlers.get("activate")!({
      waitUntil: (p: Promise<void>) => {
        task = p;
      },
    });
    await task;
    expect(w.caches.delete).toHaveBeenCalledExactlyOnceWith("respiro-doce-public-old");
  });
  it("não intercepta APIs externas, RPCs locais, POSTs, downloads ou ícones com parâmetros", () => {
    const w = worker();
    for (const [url, method] of [
      ["https://supabase.test/rest/v1/sales", "GET"],
      ["https://app.test/api/private", "GET"],
      ["https://app.test/rpc/sale", "POST"],
      ["https://app.test/backup.json", "GET"],
      ["https://app.test/icons/app.svg?token=private", "GET"],
    ]) {
      const respondWith = vi.fn();
      w.handlers.get("fetch")!({ request: { url, method, mode: "cors" }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });
  it("navegação online vem do servidor e nunca entra no cache", async () => {
    const w = worker();
    let response!: Promise<Response>;
    w.handlers.get("fetch")!({
      request: { url: "https://app.test/caixa", method: "GET", mode: "navigate" },
      respondWith: (p: Promise<Response>) => {
        response = p;
      },
    });
    expect(await (await response).text()).toBe("server");
    expect(w.caches.match).not.toHaveBeenCalled();
    expect(w.caches.open).not.toHaveBeenCalled();
  });
  it("falha de navegação devolve só a tela pública offline", async () => {
    const w = worker();
    w.fetch.mockRejectedValue(new Error("offline"));
    let response!: Promise<Response>;
    w.handlers.get("fetch")!({
      request: { url: "https://app.test/caixa", method: "GET", mode: "navigate" },
      respondWith: (p: Promise<Response>) => {
        response = p;
      },
    });
    expect(await (await response).text()).toBe("offline");
    expect(w.caches.match.mock.calls[0]![0]).toBe("/offline.html");
  });
  it("recusa ativação forçada com outras abas abertas e permite somente a janela solicitante", async () => {
    const w = worker();
    const postMessage = vi.fn();
    let task!: Promise<void>;
    const event = {
      data: { type: "RESPIRO_ACTIVATE" },
      source: { id: "tab1", postMessage },
      waitUntil: (p: Promise<void>) => {
        task = p;
      },
    };
    w.self.clients.matchAll.mockResolvedValueOnce([{ id: "tab1" }, { id: "tab2" }]);
    w.handlers.get("message")!(event);
    await task;
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: "RESPIRO_UPDATE_BLOCKED" });
    w.handlers.get("message")!(event);
    await task;
    expect(w.self.skipWaiting).toHaveBeenCalledOnce();
  });
});
