import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAccountSync } from "@/features/sync/account-sync-context";
import { commandSignal } from "@/lib/account-requests";
import { readNutrition, downloadBlob } from "@/features/data/export-data";
import { nutritionNumber, nutritionRows, nutritionSignature } from "./nutrition-domain";
export function NutritionSheet({
  owner,
  id,
  onClose,
}: {
  owner: string;
  id: string;
  onClose: () => void;
}) {
  const { online } = useAccountSync();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const report = useQuery({
    queryKey: ["nutrition", owner, id],
    queryFn: ({ signal }) => readNutrition(id, signal),
    retry: false,
  });
  const signature = nutritionSignature(report.data);
  const previous = useRef(signature);
  useEffect(() => {
    if (previous.current !== signature) setConfirm(false);
    previous.current = signature;
  }, [signature]);
  async function png() {
    if (!online || !confirm || busy) return;
    const signal = commandSignal();
    setBusy(true);
    setError("");
    try {
      // Fresh server snapshot at export time; never label stale cached data as current.
      const current = await readNutrition(id, signal);
      if (!current.ready || nutritionSignature(current) !== signature) {
        setConfirm(false);
        void report.refetch();
        throw new Error("Os dados da receita mudaram. Atualize a memória e corrija as pendências.");
      }
      const { nutritionPng } = await import("./nutrition-png");
      const blob = await nutritionPng(current);
      if (signal.aborted) return;
      downloadBlob(blob, "respiro-doce-memoria-nutricional.png");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent side="bottom" className="material-sheet nutrition-sheet">
        <div className="sheet-grabber" aria-hidden="true" />
        <SheetTitle>Nutrição da receita</SheetTitle>
        <SheetDescription>
          Composição estimada a partir dos ingredientes e do rendimento final.
        </SheetDescription>
        <p className="notice warning">
          Esta memória de cálculo não é um rótulo para embalagem. Porção legal, conteúdo por
          embalagem, perdas do processo, regras de declaração e tamanho impresso ainda exigem
          revisão específica.
        </p>
        {report.isPending ? (
          <p role="status">Calculando a composição…</p>
        ) : report.isError ? (
          <p className="notice danger" role="alert">
            {report.error.message}
          </p>
        ) : (
          <>
            <h2>{report.data.recipe.name}</h2>
            {!report.data.ready ? (
              <div className="notice warning">
                <strong>Complete os dados para calcular</strong>
                <ul>
                  {report.data.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <p>
                  Lote final: {nutritionNumber(report.data.recipe.final_quantity)}{" "}
                  {report.data.recipe.final_unit} · Porção:{" "}
                  {nutritionNumber(report.data.recipe.serving_quantity)}{" "}
                  {report.data.recipe.serving_unit} ({report.data.recipe.household_measure})
                </p>
                <div
                  className="finance-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Memória nutricional"
                >
                  <table className="nutrition-table">
                    <caption>
                      Estimativa nutricional — valores de cálculo, sem arredondamento normativo
                    </caption>
                    <thead>
                      <tr>
                        <th>Nutriente</th>
                        <th>100 {report.data.recipe.final_unit}</th>
                        <th>Porção</th>
                        <th>%VD estimado*</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nutritionRows.map(([key, label, unit]) => {
                        const row = report.data.rows.find((r) => r.key === key)!;
                        return (
                          <tr key={key}>
                            <th scope="row">
                              {label} ({unit})
                            </th>
                            <td>{nutritionNumber(row.per100)}</td>
                            <td>{nutritionNumber(row.portion)}</td>
                            <td>{nutritionNumber(row.vd)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="helper-note">
                  * Referências gerais para adultos. Não usar para público infantil ou alimentos
                  para fins especiais. Traço indica referência não definida aqui. kJ é apenas
                  conversão auxiliar de kcal × 4,184, fora do modelo de rótulo.
                </p>
              </>
            )}
            <details className="finance-details">
              <summary>Conferir ingredientes e fontes</summary>
              {report.data.ingredients.map((i) => (
                <div className="nutrition-source" key={i.id}>
                  <strong>{i.name}</strong>
                  <p>
                    {nutritionNumber(i.quantity)} {i.unit} → {nutritionNumber(i.used_base)}{" "}
                    {i.base_unit ?? "(base ausente)"}
                  </p>
                  <p>Fonte: {i.source || "Não informada"}</p>
                </div>
              ))}
            </details>
            {report.data.ready && (
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                />
                Conferi as fontes e o rendimento medido. Entendo que o PNG é uma memória de cálculo
                e não deve ser usado como rótulo.
              </label>
            )}
          </>
        )}
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
        {!online && (
          <p className="notice warning">
            Sem conexão. Conecte-se para conferir os dados antes de exportar.
          </p>
        )}
        <div className="editor-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void report.refetch()}
          >
            Recalcular
          </button>
          <button
            className="primary-button"
            disabled={busy || !online || !confirm || !report.data?.ready}
            onClick={() => void png()}
          >
            {busy ? "Gerando…" : "Baixar memória PNG (1080 px)"}
          </button>
        </div>
        <button className="text-button" disabled={busy} onClick={onClose}>
          Fechar
        </button>
      </SheetContent>
    </Sheet>
  );
}
