import { useState } from "react";
import { Download } from "lucide-react";
import { commandSignal } from "@/lib/account-requests";
import { readCustomersExport, downloadBlob } from "./export-data";
export function CustomerExportButton({ search, online }: { search: string; online: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run() {
    if (busy || !online) return;
    const signal = commandSignal();
    setBusy(true);
    setError("");
    try {
      const result = await readCustomersExport(search, signal);
      const { customersWorkbook } = await import("./customers-xlsx");
      const bytes = await customersWorkbook(result.items, result.search, result.exported_at);
      if (signal.aborted) return;
      downloadBlob(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "respiro-doce-clientes.xlsx",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="customer-export">
      <button className="secondary-button" disabled={busy || !online} onClick={() => void run()}>
        <Download size={18} />
        {busy ? "Exportando…" : "Exportar clientes (Excel)"}
      </button>
      <small>Todos os clientes do filtro, em todas as páginas.</small>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
