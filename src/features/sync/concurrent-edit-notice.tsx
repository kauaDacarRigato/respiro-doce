import { useContext, useEffect, useRef } from "react";
import { AccountSyncContext } from "./account-sync-context";
export function ConcurrentEditNotice({ editing }: { editing: boolean }) {
  const sync = useContext(AccountSyncContext);
  const baseline = useRef(sync?.revision ?? null);
  useEffect(() => {
    if (baseline.current === null && sync?.revision != null) baseline.current = sync.revision;
  }, [sync?.revision]);
  const changed =
    baseline.current !== null && sync?.revision != null && baseline.current !== sync.revision;
  if (!editing && !changed) return null;
  return (
    <p className={`notice ${changed ? "warning" : ""}`} role={changed ? "status" : undefined}>
      {changed
        ? "Os dados da conta mudaram enquanto este formulário estava aberto. Sua digitação foi mantida. Feche e reabra para conferir os dados atuais. "
        : "Se outro dispositivo editar este cadastro, vale a última gravação concluída. "}
      {changed && editing ? "Ao salvar esta edição, vale a última gravação concluída." : ""}
    </p>
  );
}
