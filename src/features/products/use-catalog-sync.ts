import { useAccountSync } from "@/features/sync/account-sync-context";
// Existing editors still receive the browser's connectivity signal. A server
// failure is shown separately and never queues or confirms a write offline.
export function useCatalogSync(_ownerId: string) {
  return useAccountSync().online;
}
