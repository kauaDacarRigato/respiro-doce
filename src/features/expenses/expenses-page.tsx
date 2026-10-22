import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ReceiptText, Search, Tags, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/auth-provider";
import { useCatalogSync } from "@/features/products/use-catalog-sync";
import { centsValue } from "@/features/products/recipe-domain";
import { dateLabel } from "@/features/sales/sale-domain";
import { removeDraft } from "@/lib/drafts";
import {
  getEntryDraft,
  type Expense,
  type EntryDraft,
  type ExpenseCommand,
} from "./expense-domain";
import { expensePageSize, listExpenses, sendExpenseCommand } from "./expense-data";
import { EntryEditor } from "./entry-editor";
import { CategoryPicker } from "./category-picker";
import { CategoriesManager } from "./categories-manager";
export function ExpensesPage() {
  const { session } = useAuth();
  const owner = session!.user.id;
  const online = useCatalogSync(owner);
  const cache = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{ item?: Expense; restored?: EntryDraft } | null>(null);
  const [draft, setDraft] = useState(() => getEntryDraft(owner, "expense"));
  const [categories, setCategories] = useState(false);
  const [remove, setRemove] = useState<{ item: Expense; command: ExpenseCommand } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const validPeriod = !from || !to || from <= to;
  const result = useQuery({
    queryKey: ["expenses", owner, from, to, category, term, page],
    queryFn: ({ signal }) => listExpenses(from, to, category, term, page, signal),
    enabled: validPeriod,
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && result.data?.items.length === 0 && !result.isFetching) setPage((p) => p - 1);
  }, [page, result.data, result.isFetching]);
  async function refresh() {
    await cache.cancelQueries({ queryKey: ["expenses", owner] });
    await cache.invalidateQueries({ queryKey: ["expenses", owner] });
  }
  function open(item?: Expense) {
    const saved = getEntryDraft(owner, "expense");
    if (saved && (!item || saved.id === item.id)) {
      setEditor({ restored: saved });
      return;
    }
    if (
      saved &&
      !window.confirm("Já existe um gasto em rascunho. Deseja substituir esse rascunho?")
    )
      return;
    setEditor(item ? { item } : {});
    setMessage("");
  }
  async function confirmDelete() {
    if (!remove || lock.current || !online) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await sendExpenseCommand(remove.command);
      setRemove(null);
      setMessage("Gasto excluído. O total foi atualizado.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a exclusão.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="catalog-page" aria-labelledby="expenses-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">SAÍDAS DO NEGÓCIO</span>
          <h1 id="expenses-title">Gastos</h1>
          <p>Acompanhe o que foi pago e organize cada saída por categoria.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => setCategories(true)}>
            <Tags size={18} /> Categorias
          </button>
          <button className="primary-button compact-button" onClick={() => open()}>
            <Plus size={19} /> Novo gasto
          </button>
        </div>
      </header>
      <nav className="product-tabs" aria-label="Área financeira">
        <span aria-current="page">Gastos</span>
        <span className="tab-upcoming">
          Caixa <small>Próxima etapa</small>
        </span>
      </nav>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {!online && (
        <p className="notice warning">
          Sem conexão. Os dados podem estar desatualizados; nenhuma gravação será confirmada
          offline.
        </p>
      )}
      {draft && !editor && (
        <div className="draft-banner">
          <div>
            <strong>Você tem um gasto em rascunho</strong>
            <small>{draft.form.description || "Gasto sem descrição"}</small>
          </div>
          <div>
            <button className="text-button" onClick={() => setEditor({ restored: draft })}>
              Retomar gasto
            </button>
            <button
              className="icon-button"
              aria-label="Descartar rascunho de gasto"
              onClick={() => {
                removeDraft(owner, "expense");
                setDraft(null);
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      )}
      <div className="catalog-tools">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar gastos"
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pela descrição…"
          />
        </label>
      </div>
      <div className="sales-filters expense-filters">
        <label className="field">
          De
          <input
            aria-label="Gastos a partir de"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Até
          <input
            aria-label="Gastos até"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <div className="field">
          <span>Categoria</span>
          <CategoryPicker
            owner={owner}
            value={category}
            filter
            onChange={(value) => {
              setCategory(value);
              setPage(0);
            }}
          />
        </div>
        <button
          className="text-button"
          onClick={() => {
            setFrom("");
            setTo("");
            setCategory("all");
            setSearch("");
            setPage(0);
          }}
        >
          Limpar filtros
        </button>
      </div>
      <p className="helper-note">
        Datas no horário de São Paulo. O total considera todos os gastos encontrados, em todas as
        páginas.
      </p>
      {!validPeriod ? (
        <p className="notice warning" role="alert">
          A data inicial deve vir antes da data final.
        </p>
      ) : result.isError ? (
        <div className="empty-state">
          <h2>Não foi possível carregar</h2>
          <p role="alert">{result.error.message}</p>
          <button className="secondary-button" onClick={() => void result.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : result.isPending ? (
        <p className="catalog-loading" role="status">
          Carregando seus gastos…
        </p>
      ) : (
        <>
          <div className="expenses-total">
            <div>
              <span>Total de gastos no filtro</span>
              <strong>{centsValue(result.data.total_cents)}</strong>
            </div>
            <p>
              {result.data.total} {result.data.total === 1 ? "lançamento" : "lançamentos"}
            </p>
            {result.isFetching && <small role="status">Atualizando…</small>}
          </div>
          {result.data.items.length === 0 ? (
            <div className="empty-state">
              <ReceiptText size={36} />
              <h2>
                {from || to || category !== "all" || term
                  ? "Nenhum gasto neste filtro"
                  : "Organize as saídas do negócio"}
              </h2>
              <p>
                Registre os pagamentos efetivos. Os custos das receitas não geram gastos
                automaticamente.
              </p>
              <button className="primary-button compact-button" onClick={() => open()}>
                Registrar gasto
              </button>
            </div>
          ) : (
            <div className="recipe-list">
              {result.data.items.map((e) => (
                <article className="recipe-card expense-card" key={e.id}>
                  <div className="recipe-card-heading">
                    <div>
                      <h2>{e.description}</h2>
                      <p>{dateLabel(e.occurred_at)}</p>
                    </div>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Editar gasto ${e.description}`}
                        onClick={() => open(e)}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className="icon-button danger-text"
                        aria-label={`Excluir gasto ${e.description}`}
                        onClick={() => {
                          setRemove({
                            item: e,
                            command: {
                              commandId: crypto.randomUUID(),
                              entity: "expense",
                              action: "delete",
                              id: e.id,
                              payload: {},
                            },
                          });
                          setError("");
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="expense-card-bottom">
                    <span className="expense-category">{e.category_name ?? "Sem categoria"}</span>
                    <strong>{centsValue((-BigInt(e.amount_cents)).toString())}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
          {result.data.total > expensePageSize && (
            <div className="catalog-pagination">
              <button
                className="secondary-button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page + 1} de {Math.ceil(result.data.total / expensePageSize)}
              </span>
              <button
                className="secondary-button"
                disabled={(page + 1) * expensePageSize >= result.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      {editor && (
        <EntryEditor
          owner={owner}
          entity="expense"
          {...editor}
          online={online}
          onClose={() => {
            setEditor(null);
            setDraft(getEntryDraft(owner, "expense"));
          }}
          onSaved={(gone) => {
            setEditor(null);
            setDraft(null);
            setMessage(gone ? "Este gasto já foi excluído. Lista atualizada." : "Gasto salvo.");
            void refresh();
          }}
        />
      )}
      {categories && (
        <CategoriesManager
          owner={owner}
          online={online}
          onClose={() => setCategories(false)}
          onDeleted={(id) => {
            if (category === id) {
              setCategory("none");
              setPage(0);
            }
          }}
        />
      )}
      <AlertDialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemove(null);
        }}
      >
        <AlertDialogContent className="delete-dialog">
          <AlertDialogTitle>Excluir gasto?</AlertDialogTitle>
          <AlertDialogDescription>
            O gasto {remove?.item.description} será excluído e deixará de participar dos totais.
          </AlertDialogDescription>
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          <div className="editor-actions">
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <button
              className="danger-button"
              disabled={busy || !online}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Excluindo…" : "Excluir gasto"}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
