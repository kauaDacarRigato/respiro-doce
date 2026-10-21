import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";

export function useCatalogSync(ownerId: string) {
  const cache = useQueryClient();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    let active = true;
    let known: number | null = null;
    let checking = false;
    const keys = [
      ["materials", ownerId],
      ["recipes", ownerId],
      ["recipe-preview", ownerId],
    ];
    const refresh = async () => {
      if (!active) return;
      await Promise.all(keys.map((queryKey) => cache.cancelQueries({ queryKey })));
      if (active) await Promise.all(keys.map((queryKey) => cache.invalidateQueries({ queryKey })));
    };
    const check = async () => {
      if (!active || checking || !navigator.onLine || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const { data, error } = await client
          .from("account_sync_state")
          .select("revision")
          .eq("owner_id", ownerId)
          .maybeSingle();
        if (error || !active) return;
        const revision = Number(data?.["revision"] ?? 0);
        if (known === null || known !== revision) await refresh();
        known = revision;
      } catch {
        /* A próxima reconexão ou verificação tentará novamente. */
      } finally {
        checking = false;
      }
    };
    const connected = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        void refresh();
        void check();
      }
    };
    setOnline(navigator.onLine);
    const channel = client
      .channel(`account:${ownerId}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, () => {
        void refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void refresh();
          void check();
        }
      });
    const timer = window.setInterval(() => {
      void check();
    }, 2000);
    void check();
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    window.addEventListener("focus", connected);
    document.addEventListener("visibilitychange", connected);
    return () => {
      active = false;
      clearInterval(timer);
      void client.removeChannel(channel);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("focus", connected);
      document.removeEventListener("visibilitychange", connected);
    };
  }, [cache, ownerId]);
  return online;
}
