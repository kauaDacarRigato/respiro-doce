// Bound Auth and Data API requests, including reads with a TanStack cancellation signal.
// No automatic write retry: a timeout does not prove the server rejected a command.
export function requestFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const upstream =
    init?.signal ??
    (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
  const abort = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) abort();
  else upstream?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException("Tempo de conexão excedido", "TimeoutError")),
    15000,
  );
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    upstream?.removeEventListener("abort", abort);
  });
}
