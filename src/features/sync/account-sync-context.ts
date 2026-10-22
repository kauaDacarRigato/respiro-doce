import { createContext, useContext } from "react";
export type SyncState = {
  online: boolean;
  revision: string | null;
  phase: "checking" | "current" | "stale" | "offline";
  realtime: boolean;
  retry: () => void;
};
export const AccountSyncContext = createContext<SyncState | null>(null);
export function useAccountSync() {
  const state = useContext(AccountSyncContext);
  if (!state) throw new Error("Sincronização indisponível fora da conta.");
  return state;
}
