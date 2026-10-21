import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/auth-provider";
import { removeDraft } from "@/lib/drafts";
import { pageSize, type MaterialCommand } from "./material-data";
import { listRecipes, sendRecipeCommand } from "./recipe-data";
import { centsValue, moneyValue, type Recipe } from "./recipe-domain";
import { RecipeEditor, getRecipeDraft, type RecipeDraft } from "./recipe-editor";
import { RecipePricingView } from "./recipe-pricing";
import { ProductTabs } from "./product-tabs";
import { useCatalogSync } from "./use-catalog-sync";
export function RecipesPage() {
  const { session } = useAuth();
  const ownerId = session!.user.id;
  const cache = useQueryClient();
  const online = useCatalogSync(ownerId);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ item?: Recipe; restored?: RecipeDraft } | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(() => getRecipeDraft(ownerId));
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState<{ item: Recipe; command: MaterialCommand } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteLock = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useQuery({
    queryKey: ["recipes", ownerId, term, page],
    queryFn: ({ signal }) => listRecipes(term, page, signal),
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && result.data?.items.length === 0 && !result.isFetching)
      setPage((p) => Math.max(0, p - 1));
  }, [page, result.data, result.isFetching]);
  const total = result.data?.total ?? 0;
  async function refresh() {
    await cache.cancelQueries({ queryKey: ["recipes", ownerId] });
    await cache.invalidateQueries({ queryKey: ["recipes", ownerId] });
  }
  function openEditor(item?: Recipe) {
    const saved = getRecipeDraft(ownerId);
    if (saved && (!item || saved.id === item.id)) {
      setEditor({ restored: saved });
      return;
    }
    if (
      saved &&
      !window.confirm("Há um rascunho de receita guardado. Deseja substituí-lo por esta edição?")
    )
      return;
    setEditor(item ? { item } : {});
    setMessage("");
  }
  async function confirmDelete() {
    if (!remove || deleteLock.current) return;
    if (!online) {
      setDeleteError("Conecte-se à internet antes de excluir.");
      return;
    }
    deleteLock.current = true;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await sendRecipeCommand(remove.command);
      setRemove(null);
      setMessage("Receita excluída.");
      await refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Não foi possível confirmar a exclusão.");
    } finally {
      deleteLock.current = false;
      setDeleteBusy(false);
    }
  }
  return (
    <section className="catalog-page" aria-labelledby="recipes-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">DO PREPARO AO PREÇO</span>
          <h1 id="recipes-title">Receitas</h1>
          <p>Conheça seus custos. Defina o preço de cada doce com clareza.</p>
        </div>
        <button className="primary-button compact-button" onClick={() => openEditor()}>
          <Plus size={19} /> Nova receita
        </button>
      </header>
      <ProductTabs active="recipes" />
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {!online && (
        <p className="notice warning" role="status">
          Sem conexão. Preços e receitas podem estar desatualizados; os rascunhos continuam
          guardados.
        </p>
      )}
      {draft && !editor && (
        <div className="draft-banner">
          <div>
            <strong>Você tem uma receita em rascunho</strong>
            <small>{draft.form.name || "Receita sem nome"}</small>
          </div>
          <div>
            <button className="text-button" onClick={() => setEditor({ restored: draft })}>
              Retomar
            </button>
            <button
              className="icon-button"
              aria-label="Descartar rascunho de receita"
              onClick={() => {
                removeDraft(ownerId, "recipe");
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
            aria-label="Buscar receitas"
            placeholder="Buscar receita pelo nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="catalog-summary">
        <span>
          {result.isPending
            ? "Carregando receitas…"
            : `${total} ${total === 1 ? "receita" : "receitas"}`}
        </span>
        {result.isFetching && !result.isPending && <span role="status">Atualizando…</span>}
      </div>
      {result.isError ? (
        <div className="empty-state">
          <h2>Não foi possível carregar</h2>
          <p>{result.error.message}</p>
          <button className="secondary-button" onClick={() => void result.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : result.isPending ? (
        <p role="status">Carregando suas receitas…</p>
      ) : result.data.items.length === 0 ? (
        <div className="empty-state">
          <ChefHat size={36} />
          <h2>{term ? "Nenhuma receita encontrada" : "O próximo doce começa aqui"}</h2>
          <p>
            {term
              ? "Tente outro nome na busca."
              : "Adicione os ingredientes, as embalagens e o rendimento para calcular seu preço sugerido."}
          </p>
          {!term && (
            <button className="primary-button compact-button" onClick={() => openEditor()}>
              <Plus size={18} /> Criar primeira receita
            </button>
          )}
        </div>
      ) : (
        <div className="recipe-list">
          {result.data.items.map((item) => (
            <article className="recipe-card" key={item.id}>
              <div className="recipe-card-heading">
                <span className="recipe-icon">
                  <ChefHat size={23} />
                </span>
                <div>
                  <h2>{item.name}</h2>
                  <p>
                    {item.yield_units
                      ? `Rende ${item.yield_units.toLocaleString("pt-BR")} ${item.yield_units === 1 ? "unidade" : "unidades"}`
                      : "Rendimento pendente"}{" "}
                    · {item.components.length} componentes
                  </p>
                </div>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => openEditor(item)}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label={`Excluir ${item.name}`}
                    onClick={() => {
                      setRemove({
                        item,
                        command: {
                          commandId: crypto.randomUUID(),
                          action: "delete",
                          id: item.id,
                          payload: {},
                        },
                      });
                      setDeleteError("");
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="recipe-card-prices">
                <div>
                  <span>Preço sugerido / un.</span>
                  <strong>{centsValue(item.pricing.suggested_cents)}</strong>
                </div>
                <div>
                  <span>Produção / un.</span>
                  <b>
                    {item.pricing.unit_cost === null ? "—" : moneyValue(item.pricing.unit_cost)}
                  </b>
                </div>
              </div>
              {!item.pricing.ready && <p className="notice warning">{item.pricing.reason}</p>}
              <details className="recipe-card-details">
                <summary>Composição e cálculo</summary>
                <div className="saved-components">
                  {item.pricing.components.map((c) => (
                    <div key={c.material_id}>
                      <span>
                        {c.name}
                        <small>
                          {Number(c.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 6 })}{" "}
                          {c.unit}
                        </small>
                      </span>
                      <b>{moneyValue(c.cost)}</b>
                    </div>
                  ))}
                </div>
                <RecipePricingView pricing={item.pricing} fee={item.fee_percent} />
              </details>
            </article>
          ))}
        </div>
      )}
      {total > pageSize && (
        <div className="catalog-pagination">
          <button
            className="secondary-button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </button>
          <span>
            Página {page + 1} de {Math.ceil(total / pageSize)}
          </span>
          <button
            className="secondary-button"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
      {editor && (
        <RecipeEditor
          ownerId={ownerId}
          {...editor}
          online={online}
          onClose={() => {
            setEditor(null);
            setDraft(getRecipeDraft(ownerId));
          }}
          onSaved={(gone) => {
            setEditor(null);
            setDraft(null);
            setMessage(
              gone
                ? "Esta receita já foi excluída. A lista será atualizada."
                : "Receita salva. O preço acompanha os custos atuais dos insumos.",
            );
            void refresh();
          }}
        />
      )}
      <AlertDialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setRemove(null);
        }}
      >
        <AlertDialogContent className="delete-dialog">
          <AlertDialogTitle>Excluir receita?</AlertDialogTitle>
          <AlertDialogDescription>
            A receita {remove?.item.name} e sua composição serão excluídas. Os insumos e as
            embalagens permanecem no catálogo.
          </AlertDialogDescription>
          {deleteError && (
            <p className="notice danger" role="alert">
              {deleteError}
            </p>
          )}
          <div className="editor-actions">
            <AlertDialogCancel disabled={deleteBusy}>Cancelar</AlertDialogCancel>
            <button
              className="danger-button"
              disabled={deleteBusy || !online}
              onClick={() => void confirmDelete()}
            >
              {deleteBusy ? "Excluindo…" : "Excluir receita"}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
