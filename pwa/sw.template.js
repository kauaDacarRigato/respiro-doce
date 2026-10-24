/* Cache exclusivo de arquivos públicos. Nenhuma resposta de API ou página autenticada. */
const CACHE = "respiro-doce-public-__BUILD_VERSION__";
const PUBLIC_FILES = [
  "/offline.html",
  "/icons/app.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PUBLIC_FILES);
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("respiro-doce-public-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (PUBLIC_FILES.includes(url.pathname) && !url.search) {
    event.respondWith(
      (async () => (await caches.match(request, { cacheName: CACHE })) || fetch(request))(),
    );
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (
            (await caches.match("/offline.html", { cacheName: CACHE })) ||
            new Response("Sem conexão. Conecte-se e tente novamente.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
  }
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "RESPIRO_ACTIVATE" || !event.source?.id) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // A atualização nunca força outra janela a perder o formulário em edição.
      if (windows.length !== 1 || windows[0].id !== event.source.id) {
        event.source.postMessage({ type: "RESPIRO_UPDATE_BLOCKED" });
        return;
      }
      await self.skipWaiting();
    })(),
  );
});
