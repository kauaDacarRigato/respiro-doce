import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { saveDraft, removeDraft } from "@/lib/drafts";
import { MaterialCommandError } from "@/features/products/material-data";
import {
  entryPayload,
  initialEntry,
  type EntryEntity,
  type EntryDraft,
  type ExpenseCommand,
  type Category,
  type Expense,
  type EntryForm,
} from "./expense-domain";
import { sendExpenseCommand } from "./expense-data";
import { CategoryPicker } from "./category-picker";
export function EntryEditor({
  owner,
  entity,
  item,
  restored,
  online,
  onClose,
  onSaved,
}: {
  owner: string;
  entity: EntryEntity;
  item?: Expense | Category;
  restored?: EntryDraft;
  online: boolean;
  onClose: () => void;
  onSaved: (gone: boolean) => void;
}) {
  const [form, setForm] = useState(() => restored?.form ?? initialEntry(item));
  const [id] = useState(() => restored?.id ?? item?.id ?? crypto.randomUUID());
  const action = restored?.action ?? (item ? "update" : "create");
  const [pending, setPending] = useState<ExpenseCommand | null>(restored?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(true);
  const lock = useRef(false);
  const category = entity === "expense_category";
  useEffect(() => {
    setAvailable(saveDraft(owner, entity, { entity, id, action, form, pending }));
  }, [owner, entity, id, action, form, pending]);
  const change = <K extends keyof EntryForm>(key: K, value: EntryForm[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setError("");
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    if (!online) {
      setError("Conecte-se antes de salvar.");
      return;
    }
    let command: ExpenseCommand;
    try {
      command = pending ?? {
        commandId: crypto.randomUUID(),
        entity,
        action,
        id,
        payload: entryPayload(entity, form),
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os campos.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(command);
    setAvailable(saveDraft(owner, entity, { entity, id, action, form, pending: command }));
    try {
      const result = await sendExpenseCommand(command);
      removeDraft(owner, entity);
      onSaved(result.status === "gone");
    } catch (e) {
      if (e instanceof MaterialCommandError && e.definitive) setPending(null);
      setError(e instanceof Error ? e.message : "Não foi possível confirmar o salvamento.");
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
        <SheetTitle>
          {category
            ? action === "update"
              ? "Editar categoria"
              : "Nova categoria"
            : action === "update"
              ? "Editar gasto"
              : "Novo gasto"}
        </SheetTitle>
        <SheetDescription>
          {category
            ? "Organize os gastos sem alterar seus valores."
            : "Registre uma saída realmente paga pelo negócio."}
        </SheetDescription>
        <form onSubmit={submit} className="material-form" aria-busy={busy}>
          {!available && (
            <p className="notice warning" role="alert">
              Este navegador não conseguiu guardar o rascunho. Mantenha a tela aberta até salvar.
            </p>
          )}
          {restored && (
            <p className="notice success">Rascunho recuperado. Confira os dados antes de salvar.</p>
          )}
          <fieldset disabled={busy || pending !== null} className="form-fields">
            {category ? (
              <label className="field">
                Nome da categoria
                <input
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => change("name", e.target.value)}
                  placeholder="Ex.: Aluguel"
                />
              </label>
            ) : (
              <>
                <label className="field">
                  Descrição do gasto
                  <input
                    required
                    maxLength={200}
                    value={form.description}
                    onChange={(e) => change("description", e.target.value)}
                    placeholder="Ex.: Compra de gás"
                  />
                </label>
                <label className="field">
                  Valor pago (R$)
                  <input
                    required
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => change("amount", e.target.value)}
                    placeholder="Ex.: 120,00"
                  />
                </label>
                <div className="field">
                  <span>Categoria</span>
                  <CategoryPicker
                    owner={owner}
                    value={form.categoryId}
                    onChange={(value) => change("categoryId", value)}
                  />
                </div>
                <label className="field">
                  Data e hora do gasto
                  <input
                    aria-label="Data e hora do gasto"
                    type="datetime-local"
                    step="1"
                    min="2000-01-01T00:00"
                    max="2099-12-31T23:59:59"
                    required
                    value={form.occurredLocal}
                    onChange={(e) => change("occurredLocal", e.target.value)}
                  />
                  <small>Horário de São Paulo, inclusive para gastos retroativos.</small>
                </label>
                <p className="notice warning">
                  As taxas de pagamento já são descontadas nas vendas. Evite lançá-las novamente
                  como gasto.
                </p>
                <p className="helper-note">
                  O custo de uma receita não gera uma saída automática. Registre aqui os pagamentos
                  efetivamente realizados.
                </p>
              </>
            )}
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
            <p className="notice warning" role="status">
              Sem conexão.{" "}
              {available
                ? "O rascunho está preservado; nenhuma gravação foi confirmada."
                : "Mantenha esta tela aberta."}
            </p>
          )}
          <div className="editor-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
              Fechar e guardar
            </button>
            <button type="submit" className="primary-button" disabled={busy || !online}>
              {busy
                ? "Salvando…"
                : pending
                  ? "Tentar novamente"
                  : category
                    ? "Salvar categoria"
                    : "Salvar gasto"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
