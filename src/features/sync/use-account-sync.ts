import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { SyncState } from "./account-sync-context";
const accountKeys = new Set([
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
  "nutrition",
]);
export function useAccountSyncEngine(ownerId: string): SyncState {
  const cache = useQueryClient();
  const [revision, setRevision] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [phase, setPhase] = useState<SyncState["phase"]>("checking");
  const [realtime, setRealtime] = useState(false);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    let active = true;
    let known: string | null = null;
    let checking = false;
    let forced = true;
    let request: AbortController | null = null;
    let channel: RealtimeChannel | null = null;
    const owned = (q: { queryKey: readonly unknown[] }) =>
      q.queryKey[1] === ownerId && accountKeys.has(String(q.queryKey[0]));
    const check = async () => {
      if (!active || checking || !navigator.onLine || document.visibilityState === "hidden") return;
      checking = true;
      const force = forced;
      forced = false;
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 8000);
      try {
        const { data, error } = await client
          .from("account_sync_state")
          .select("revision")
          .eq("owner_id", ownerId)
          .abortSignal(request.signal)
          .maybeSingle();
        if (!active || !navigator.onLine) return;
        if (error) throw error;
        const revision = String(data?.["revision"] ?? "0");
        const failedRead = cache
          .getQueryCache()
          .findAll({ predicate: owned })
          .some(
            (q) =>
              q.getObserversCount() > 0 &&
              q.state.status === "error" &&
              !["recipe-preview", "sale-preview"].includes(String(q.queryKey[0])),
          );
        if (force || known === null || known !== revision || failedRead) {
          await cache.cancelQueries({ predicate: owned });
          if (!active) return;
          await cache.invalidateQueries({ predicate: owned });
        }
        if (!active || !navigator.onLine) return;
        known = revision;
        setRevision(revision);
        setPhase("current");
      } catch {
        if (active && navigator.onLine) setPhase("stale");
      } finally {
        clearTimeout(timeout);
        request = null;
        checking = false;
        if (active && forced) void check();
      }
    };
    const trigger = () => {
      if (!active) return;
      // Cancel reads as soon as an official event/reconnection is observed. A late
      // response must not restore rows deleted by a newer completed command.
      if (!forced) void cache.cancelQueries({ predicate: owned });
      forced = true;
      void check();
    };
    const connection = () => {
      if (!active) return;
      setOnline(navigator.onLine);
      if (!navigator.onLine) {
        request?.abort();
        setPhase("offline");
      } else if (document.visibilityState !== "hidden") {
        setPhase("checking");
        trigger();
      }
    };
    retry.current = () => {
      setPhase(navigator.onLine ? "checking" : "offline");
      trigger();
    };
    setOnline(navigator.onLine);
    setPhase(navigator.onLine ? "checking" : "offline");
    setRealtime(false);
    setRevision(null);
    // Kept outside onAuthStateChange to avoid taking the Auth session lock inside
    // its own callback. supabase-js propagates later token renewals to Realtime.
    void (async () => {
      try {
        await client.realtime.setAuth();
        if (!active) return;
        channel = client
          .channel(`account:${ownerId}`, { config: { private: true } })
          .on("broadcast", { event: "changed" }, trigger)
          .subscribe((status) => {
            if (!active) return;
            setRealtime(status === "SUBSCRIBED");
            if (status === "SUBSCRIBED") trigger();
          });
      } catch {
        /* Revision checks remain available without WebSocket. */
      }
    })();
    const timer = window.setInterval(() => {
      void check();
    }, 2000);
    void check();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener("focus", connection);
    document.addEventListener("visibilitychange", connection);
    return () => {
      active = false;
      request?.abort();
      clearInterval(timer);
      retry.current = () => {};
      if (channel) void client.removeChannel(channel).catch(() => {});
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener("focus", connection);
      document.removeEventListener("visibilitychange", connection);
    };
  }, [cache, ownerId]);
  return { online, revision, phase, realtime, retry: () => retry.current() };
}
