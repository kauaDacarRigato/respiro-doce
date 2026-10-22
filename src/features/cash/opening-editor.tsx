import { ConcurrentEditNotice } from "@/features/sync/concurrent-edit-notice";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { saveDraft, removeDraft } from "@/lib/drafts";
import { MaterialCommandError } from "@/features/products/material-data";
import { saoPauloInput } from "@/features/sales/sale-domain";
import {
  openingDraft,
  openingPayload,
  signedInput,
  type OpeningBalance,
  type OpeningCommand,
} from "./finance-domain";
import { sendOpening } from "./finance-data";
export function OpeningEditor({
  owner,
  opening,
  online,
  onClose,
  onSaved,
}: {
  owner: string;
  opening: OpeningBalance;
  online: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [restored] = useState(() => openingDraft(owner));
  const [form, setForm] = useState(
    () =>
      restored?.form ?? {
        amount: signedInput(opening.amount_cents),
        occurredLocal: saoPauloInput(new Date(opening.occurred_at)),
        confirm: false,
      },
  );
  const [pending, setPending] = useState<OpeningCommand | null>(restored?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(true);
  const lock = useRef(false);
  useEffect(() => {
    setAvailable(saveDraft(owner, "opening", { form, pending }));
  }, [owner, form, pending]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || !online) return;
    let command: OpeningCommand;
    try {
      command = pending ?? { commandId: crypto.randomUUID(), payload: openingPayload(form) };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os campos.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(command);
    setAvailable(saveDraft(owner, "opening", { form, pending: command }));
    try {
      await sendOpening(command);
      removeDraft(owner, "opening");
      onSaved();
    } catch (e) {
      if (e instanceof MaterialCommandError && e.definitive) setPending(null);
      setError(e instanceof Error ? e.message : "Não foi possível confirmar o saldo.");
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
        <SheetTitle>Saldo inicial</SheetTitle>
        <SheetDescription>Informe o valor que serve de base para o seu caixa.</SheetDescription>
        <form className="material-form" onSubmit={submit} aria-busy={busy}>
          <ConcurrentEditNotice editing={true} />
          {restored && (
            <p className="notice success">Rascunho recuperado. Confira os dados antes de salvar.</p>
          )}
          {!available && (
            <p className="notice warning">
              O rascunho não pôde ser guardado. Mantenha esta tela aberta até salvar.
            </p>
          )}
          <p className="notice warning">
            O saldo inicial é somado às vendas líquidas e aos gastos. Ele não zera as movimentações
            anteriores nem conta como venda ou lucro. Alterá-lo substitui a base anterior e
            recalcula o histórico.
          </p>
          <fieldset className="form-fields" disabled={busy || pending !== null}>
            <label className="field">
              Valor inicial (R$)
              <input
                required
                aria-label="Valor inicial (R$)"
                inputMode="text"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <small>
                Use sinal negativo se o caixa começou em dívida. Use zero para retirar o saldo
                inicial.
              </small>
            </label>
            <label className="field">
              Data e hora do saldo inicial
              <input
                required
                aria-label="Data e hora do saldo inicial"
                type="datetime-local"
                step="1"
                min="2000-01-01T00:00"
                max="2099-12-31T23:59:59"
                value={form.occurredLocal}
                onChange={(e) => setForm({ ...form, occurredLocal: e.target.value })}
              />
              <small>Horário de São Paulo.</small>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.checked })}
              />
              Confirmo que este valor será somado às movimentações e substituirá o saldo inicial
              anterior.
            </label>
          </fieldset>
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          {pending && !busy && (
            <p className="notice warning">
              Tentativa aguardando confirmação. Repita com os mesmos dados para evitar duplicação.
            </p>
          )}
          {!online && (
            <p className="notice warning">Sem conexão. Nenhuma gravação foi confirmada.</p>
          )}
          <div className="editor-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
              Fechar e guardar
            </button>
            <button className="primary-button" type="submit" disabled={busy || !online}>
              {busy ? "Salvando…" : pending ? "Tentar novamente" : "Salvar saldo inicial"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
