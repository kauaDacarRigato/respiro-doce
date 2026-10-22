import { RefreshCw, WifiOff } from "lucide-react";
import { useAccountSync } from "./account-sync-context";
export function SyncStatus() {
  const { phase, realtime, retry } = useAccountSync();
  return (
    <div className={`sync-status ${phase}`}>
      <span role="status">
        {phase === "offline" ? (
          <>
            <WifiOff size={15} />
            Sem conexão
          </>
        ) : phase === "stale" ? (
          "Não foi possível conferir as atualizações. Os dados podem estar desatualizados."
        ) : phase === "checking" ? (
          "Conferindo conexão…"
        ) : realtime ? (
          "Atualizações automáticas ativas"
        ) : (
          "Atualizações por verificação periódica"
        )}
      </span>
      {(phase === "stale" || phase === "current") && (
        <button
          type="button"
          className="text-button"
          aria-label="Conferir atualizações agora"
          onClick={retry}
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      )}
    </div>
  );
}
