import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { removeDraft } from "@/lib/drafts";
import {
  getEntryDraft,
  type Category,
  type EntryDraft,
  type ExpenseCommand,
} from "./expense-domain";
import { categoryPageSize, listCategories, sendExpenseCommand } from "./expense-data";
import { EntryEditor } from "./entry-editor";
export function CategoriesManager({
  owner,
  online,
  onClose,
  onDeleted,
}: {
  owner: string;
  online: boolean;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState(() => getEntryDraft(owner, "expense_category"));
  const [editor, setEditor] = useState<{ item?: Category; restored?: EntryDraft } | null>(null);
  const [remove, setRemove] = useState<{ item: Category; command: ExpenseCommand } | null>(null);
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
  const result = useQuery({
    queryKey: ["expense-categories", owner, "manager", term, page],
    queryFn: ({ signal }) => listCategories(term, page, signal),
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && result.data?.items.length === 0 && !result.isFetching) setPage((p) => p - 1);
  }, [page, result.data, result.isFetching]);
  async function refresh() {
    await Promise.all(
      ["expense-categories", "expenses"].map(async (key) => {
        await cache.cancelQueries({ queryKey: [key, owner] });
        await cache.invalidateQueries({ queryKey: [key, owner] });
      }),
    );
  }
  function open(item?: Category) {
    const saved = getEntryDraft(owner, "expense_category");
    if (saved && (!item || saved.id === item.id)) {
      setEditor({ restored: saved });
      return;
    }
    if (
      saved &&
      !window.confirm("Já existe uma categoria em rascunho. Deseja substituir esse rascunho?")
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
      onDeleted(remove.item.id);
      setRemove(null);
      setMessage("Categoria excluída. Os gastos foram preservados como Sem categoria.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a exclusão.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !editor && !remove && !busy) onClose();
      }}
    >
      <SheetContent side="bottom" className="material-sheet">
        <div className="sheet-grabber" aria-hidden="true" />
        <SheetTitle>Categorias de gastos</SheetTitle>
        <SheetDescription>
          Organize os lançamentos. Excluir uma categoria mantém os gastos e seus valores.
        </SheetDescription>
        <div className="categories-manager">
          <button className="primary-button compact-button" onClick={() => open()}>
            <Plus size={18} /> Nova categoria
          </button>
          {message && (
            <p className="notice success" role="status">
              {message}
            </p>
          )}
          {!online && (
            <p className="notice warning">Sem conexão. Os rascunhos continuam guardados.</p>
          )}
          {draft && !editor && (
            <div className="draft-banner">
              <div>
                <strong>Categoria em rascunho</strong>
                <small>{draft.form.name || "Sem nome"}</small>
              </div>
              <div>
                <button className="text-button" onClick={() => setEditor({ restored: draft })}>
                  Retomar categoria
                </button>
                <button
                  className="icon-button"
                  aria-label="Descartar rascunho de categoria"
                  onClick={() => {
                    removeDraft(owner, "expense_category");
                    setDraft(null);
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          )}
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Buscar categorias cadastradas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoria…"
            />
          </label>
          {result.isPending ? (
            <p role="status">Carregando categorias…</p>
          ) : result.isError ? (
            <p className="notice danger" role="alert">
              {result.error.message}
              <button className="text-button" onClick={() => void result.refetch()}>
                Tentar novamente
              </button>
            </p>
          ) : (
            <>
              <p className="helper-note">{result.data.total} categorias</p>
              {result.data.items.length === 0 && (
                <p className="notice warning">
                  Nenhuma categoria encontrada. Gastos também podem ser salvos sem categoria.
                </p>
              )}
              <div className="category-rows">
                {result.data.items.map((c) => (
                  <div key={c.id} className="category-row">
                    <strong>{c.name}</strong>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        aria-label={`Editar categoria ${c.name}`}
                        onClick={() => open(c)}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        className="icon-button danger-text"
                        aria-label={`Excluir categoria ${c.name}`}
                        onClick={() => {
                          setRemove({
                            item: c,
                            command: {
                              commandId: crypto.randomUUID(),
                              entity: "expense_category",
                              action: "delete",
                              id: c.id,
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
                ))}
              </div>
              {result.data.total > categoryPageSize && (
                <div className="catalog-pagination">
                  <button
                    className="secondary-button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <span>Página {page + 1}</span>
                  <button
                    className="secondary-button"
                    disabled={(page + 1) * categoryPageSize >= result.data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {editor && (
          <EntryEditor
            owner={owner}
            entity="expense_category"
            {...editor}
            online={online}
            onClose={() => {
              setEditor(null);
              setDraft(getEntryDraft(owner, "expense_category"));
            }}
            onSaved={(gone) => {
              setEditor(null);
              setDraft(null);
              setMessage(
                gone ? "Esta categoria já foi excluída. Lista atualizada." : "Categoria salva.",
              );
              void refresh();
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
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria {remove?.item.name} será excluída. Os gastos associados permanecem, com os
              mesmos valores e datas, como Sem categoria.
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
                {busy ? "Excluindo…" : "Excluir categoria"}
              </button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
