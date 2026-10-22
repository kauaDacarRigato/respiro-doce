import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { readDraft, removeDraft, saveDraft } from "@/lib/drafts";
import { decimalInput } from "@/features/products/material-domain";
import { MaterialCommandError } from "@/features/products/material-data";
import { commandSchema } from "./sale-draft";
import { readFees, sendCommerceCommand, type CommerceCommand } from "./sale-data";
export function FeeEditor({
  owner,
  online,
  onClose,
  onSaved,
}: {
  owner: string;
  online: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saved] = useState(() => readDraft(owner, "fees"));
  const [debit, setDebit] = useState(typeof saved?.["debit"] === "string" ? saved["debit"] : null);
  const [credit, setCredit] = useState(
    typeof saved?.["credit"] === "string" ? saved["credit"] : null,
  );
  const [pending, setPending] = useState<CommerceCommand | null>(() => {
    const p = commandSchema.safeParse(saved?.["pending"]);
    return p.success && p.data.entity === "fees" ? p.data : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(true);
  const lock = useRef(false);
  const result = useQuery({
    queryKey: ["fees", owner],
    queryFn: ({ signal }) => readFees(signal),
    retry: false,
  });
  const d = debit ?? (result.data ? String(result.data.debit_fee_percent) : "");
  const c = credit ?? (result.data ? String(result.data.credit_fee_percent) : "");
  useEffect(() => {
    if (debit !== null || credit !== null || pending)
      setAvailable(saveDraft(owner, "fees", { debit: d, credit: c, pending }));
  }, [owner, debit, credit, d, c, pending]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || !online) return;
    let command: CommerceCommand;
    try {
      const dv = decimalInput(d, 3),
        cv = decimalInput(c, 3);
      if (Number(dv) >= 100 || Number(cv) >= 100)
        throw new Error("Use taxas de zero a menos de 100%.");
      command = pending ?? {
        commandId: crypto.randomUUID(),
        entity: "fees",
        action: "update",
        id: owner,
        payload: { debit_fee_percent: dv, credit_fee_percent: cv },
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira as taxas.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setPending(command);
    setError("");
    setAvailable(saveDraft(owner, "fees", { debit: d, credit: c, pending: command }));
    try {
      await sendCommerceCommand(command);
      removeDraft(owner, "fees");
      onSaved();
    } catch (e) {
      if (e instanceof MaterialCommandError && e.definitive) setPending(null);
      setError(e instanceof Error ? e.message : "Não foi possível confirmar as taxas.");
    } finally {
      lock.current = false;
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
      <SheetContent side="bottom" className="material-sheet">
        <div className="sheet-grabber" aria-hidden="true" />
        <SheetTitle>Taxas de cartão</SheetTitle>
        <SheetDescription>
          Valem para novas vendas e para trocas de produto. As vendas anteriores mantêm as taxas
          guardadas.
        </SheetDescription>
        <form onSubmit={submit} className="material-form">
          {result.isError && (
            <p className="notice danger" role="alert">
              {result.error.message}
              <button type="button" className="text-button" onClick={() => void result.refetch()}>
                Tentar novamente
              </button>
            </p>
          )}
          <fieldset className="form-fields" disabled={busy || pending !== null || result.isPending}>
            <label className="field">
              Taxa de débito (%)
              <input
                required
                inputMode="decimal"
                value={d}
                onChange={(e) => setDebit(e.target.value)}
              />
            </label>
            <label className="field">
              Taxa de crédito (%)
              <input
                required
                inputMode="decimal"
                value={c}
                onChange={(e) => setCredit(e.target.value)}
              />
            </label>
          </fieldset>
          <p className="notice success">Dinheiro e Pix: taxa zero.</p>
          {!available && (
            <p className="notice warning">Rascunho indisponível. Mantenha esta tela aberta.</p>
          )}
          {!online && (
            <p className="notice warning">Sem conexão. Nenhuma alteração foi confirmada.</p>
          )}
          {pending && !busy && (
            <p className="notice warning">Aguardando confirmação. Repita a mesma tentativa.</p>
          )}
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          <div className="editor-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
              Fechar e guardar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !online || result.isPending || result.isError}
            >
              {busy ? "Salvando…" : pending ? "Tentar novamente" : "Salvar taxas"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
