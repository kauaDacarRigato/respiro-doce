import type { ReactNode } from "react";
import { AccountSyncContext } from "./account-sync-context";
import { useAccountSyncEngine } from "./use-account-sync";
export function AccountSyncProvider({
  ownerId,
  children,
}: {
  ownerId: string;
  children: ReactNode;
}) {
  const state = useAccountSyncEngine(ownerId);
  return <AccountSyncContext.Provider value={state}>{children}</AccountSyncContext.Provider>;
}
