import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useAccountSyncEngine } from "@/features/sync/use-account-sync";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  setAuth: vi.fn(),
  remove: vi.fn(),
  broadcast: null as (() => void) | null,
  status: null as ((s: string) => void) | null,
  signal: null as AbortSignal | null,
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    realtime: { setAuth: mocks.setAuth },
    from: () => ({
      select: () => ({
        eq: () => ({
          abortSignal: (signal: AbortSignal) => ({
            maybeSingle: () => {
              mocks.signal = signal;
              return mocks.read(signal);
            },
          }),
        }),
      }),
    }),
    channel: () => ({
      on: (_type: string, _event: unknown, cb: () => void) => {
        mocks.broadcast = cb;
        return {
          subscribe: (cb: (s: string) => void) => {
            mocks.status = cb;
            return { testChannel: true };
          },
        };
      },
    }),
    removeChannel: mocks.remove,
  }),
}));
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
describe("sincronização da conta", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.broadcast = null;
    mocks.status = null;
    mocks.setAuth.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue("ok");
    mocks.read.mockResolvedValue({ data: { revision: "1" }, error: null });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  function mount(owner = "A") {
    const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const hook = renderHook(({ owner }) => useAccountSyncEngine(owner), {
      initialProps: { owner },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    });
    return { ...hook, cache, invalidate };
  }
  it("reconcilia todos os módulos da própria conta, sem tocar na outra conta", async () => {
    const { cache, invalidate, result } = mount();
    await flush();
    for (const key of [
      "materials",
      "recipes",
      "recipe-preview",
      "sales",
      "customers",
      "fees",
      "sale-preview",
      "expenses",
      "expense-categories",
      "cash",
      "reports",
      "opening",
    ]) {
      cache.setQueryData([key, "A"], "antes");
      cache.setQueryData([key, "B"], "outra");
    }
    act(() => mocks.broadcast?.());
    await flush();
    expect(invalidate).toHaveBeenCalled();
    for (const q of cache.getQueryCache().getAll())
      expect(q.state.isInvalidated).toBe(q.queryKey[1] === "A");
    expect(result.current.phase).toBe("current");
    expect(result.current.revision).toBe("1");
    act(() => mocks.status?.("SUBSCRIBED"));
    await flush();
    expect(result.current.realtime).toBe(true);
    act(() => mocks.status?.("CHANNEL_ERROR"));
    expect(result.current.realtime).toBe(false);
    mocks.read.mockResolvedValue({ data: { revision: "2" }, error: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.revision).toBe("2");
  });
  it("libera a verificação após timeout e recupera sem recarregar a página", async () => {
    mocks.read.mockImplementationOnce(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("timeout"))),
        ),
    );
    const { result } = mount();
    await flush();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(result.current.phase).toBe("stale");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(result.current.phase).toBe("current");
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("não consulta offline/em segundo plano e reconcilia ao voltar ao foco", async () => {
    const { result, invalidate } = mount();
    await flush();
    const before = mocks.read.mock.calls.length;
    Object.defineProperty(navigator, "onLine", { value: false });
    act(() => window.dispatchEvent(new Event("offline")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(mocks.read).toHaveBeenCalledTimes(before);
    expect(result.current.online).toBe(false);
    Object.defineProperty(navigator, "onLine", { value: true });
    Object.defineProperty(document, "visibilityState", { value: "hidden" });
    act(() => window.dispatchEvent(new Event("online")));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(mocks.read).toHaveBeenCalledTimes(before);
    Object.defineProperty(document, "visibilityState", { value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(result.current.online).toBe(true);
    expect(invalidate.mock.calls.length).toBeGreaterThan(1);
  });
  it("cancela resposta antiga ao receber evento e agrupa uma rajada de avisos", async () => {
    const { cache } = mount();
    await flush();
    let release!: () => void;
    let reads = 0;
    const observer = new QueryObserver(cache, {
      queryKey: ["sales", "A"],
      queryFn: () =>
        ++reads === 1
          ? new Promise((resolve) => {
              release = () => resolve("resposta antiga");
            })
          : Promise.resolve("resposta atual"),
    });
    const stop = observer.subscribe(() => {});
    await flush();
    act(() => {
      mocks.broadcast?.();
      mocks.broadcast?.();
      mocks.broadcast?.();
    });
    await flush();
    act(() => release());
    await flush();
    expect(cache.getQueryData(["sales", "A"])).toBe("resposta atual");
    expect(mocks.read.mock.calls.length).toBeLessThanOrEqual(3);
    stop();
  });
  it("refaz leitura que falhou mesmo sem mudança de revisão", async () => {
    const { cache, invalidate } = mount();
    await flush();
    let calls = 0;
    const observer = new QueryObserver(cache, {
      queryKey: ["expenses", "A"],
      queryFn: async () => {
        if (++calls === 1) throw new Error("interrompida");
        return "recuperado";
      },
      retry: false,
    });
    const stop = observer.subscribe(() => {});
    await flush();
    expect(cache.getQueryState(["expenses", "A"])?.status).toBe("error");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(cache.getQueryData(["expenses", "A"])).toBe("recuperado");
    expect(invalidate.mock.calls.length).toBeGreaterThan(1);
    stop();
  });
  it("remove canal e aborta a consulta ao desmontar/trocar de dono", async () => {
    const { unmount, result } = mount();
    await flush();
    let release!: (value: unknown) => void;
    mocks.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    act(() => mocks.broadcast?.());
    await flush();
    const signal = mocks.signal;
    const lastPhase = result.current.phase;
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    release({ data: { revision: "2" }, error: null });
    await flush();
    act(() => mocks.broadcast?.());
    await flush();
    expect(result.current.phase).toBe(lastPhase);
  });
});
