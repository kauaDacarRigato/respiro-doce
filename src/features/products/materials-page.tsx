import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  FlaskConical,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { removeDraft } from "@/lib/drafts";
import { useAuth } from "@/features/auth/auth-provider";
import {
  listMaterials,
  pageSize,
  sendMaterialCommand,
  type MaterialCommand,
} from "./material-data";
import {
  missingNutrition,
  unitCost,
  unitLabels,
  type Material,
  type MaterialKind,
} from "./material-domain";
import { MaterialEditor, getMaterialDraft, type MaterialDraft } from "./material-editor";
import { ProductTabs } from "./product-tabs";
import { useCatalogSync } from "./use-catalog-sync";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const smallMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 6,
});
export function MaterialsPage() {
  const { session } = useAuth();
  const ownerId = session!.user.id;
  const cache = useQueryClient();
  const online = useCatalogSync(ownerId);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<MaterialKind | "all">("all");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ item?: Material; restored?: MaterialDraft } | null>(null);
  const [draft, setDraft] = useState<MaterialDraft | null>(() => getMaterialDraft(ownerId));
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState<{ item: Material; command: MaterialCommand } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteLock = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useQuery({
    queryKey: ["materials", ownerId, term, kind, page],
    queryFn: ({ signal }) => listMaterials(term, kind, page, signal),
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && result.data?.items.length === 0 && !result.isFetching)
      setPage((p) => Math.max(0, p - 1));
  }, [result.data, result.isFetching, page]);
  const total = result.data?.total ?? 0;
  async function refresh() {
    await cache.cancelQueries({ queryKey: ["materials", ownerId] });
    await cache.invalidateQueries({ queryKey: ["materials", ownerId] });
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
      await sendMaterialCommand(remove.command);
      setRemove(null);
      setMessage("Cadastro excluído.");
      await refresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Não foi possível excluir. Tente novamente.");
    } finally {
      deleteLock.current = false;
      setDeleteBusy(false);
    }
  }
  function closeEditor() {
    setEditor(null);
    setDraft(getMaterialDraft(ownerId));
  }
  function openEditor(item?: Material) {
    const saved = getMaterialDraft(ownerId);
    if (saved && (!item || saved.id === item.id)) {
      setEditor({ restored: saved });
      return;
    }
    if (
      saved &&
      !window.confirm("Há um rascunho guardado. Deseja substituí-lo pela edição deste cadastro?")
    )
      return;
    setEditor(item ? { item } : {});
    setMessage("");
  }
  return (
    <section className="catalog-page" aria-labelledby="catalog-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">A BASE DE CADA RECEITA</span>
          <h1 id="catalog-title">Produtos</h1>
          <p>Organize o que você compra. Saiba quanto cada ingrediente custa.</p>
        </div>
        <button
          className="primary-button compact-button"
          onClick={() => {
            openEditor();
            setMessage("");
          }}
        >
          <Plus size={19} /> Novo cadastro
        </button>
      </header>
      <ProductTabs active="materials" />
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {!online && (
        <p className="notice warning" role="status">
          Sem conexão. Os dados podem estar desatualizados; os rascunhos continuam guardados.
        </p>
      )}
      {draft && !editor && (
        <div className="draft-banner">
          <div>
            <strong>Você tem um rascunho guardado</strong>
            <small>{draft.form.name || "Cadastro sem nome"}</small>
          </div>
          <div>
            <button className="text-button" onClick={() => setEditor({ restored: draft })}>
              Retomar
            </button>
            <button
              className="icon-button"
              aria-label="Descartar rascunho"
              onClick={() => {
                removeDraft(ownerId, "material");
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
            aria-label="Buscar insumos e embalagens"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo nome…"
          />
        </label>
        <label className="filter-field">
          <span className="sr-only">Filtrar por tipo</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as MaterialKind | "all");
              setPage(0);
            }}
          >
            <option value="all">Todos os tipos</option>
            <option value="ingredient">Insumos</option>
            <option value="packaging">Embalagens</option>
          </select>
        </label>
      </div>
      <div className="catalog-summary">
        <span>
          {result.isPending
            ? "Carregando cadastros…"
            : `${total} ${total === 1 ? "cadastro" : "cadastros"}`}
        </span>
        {result.isFetching && !result.isPending && <span role="status">Atualizando…</span>}
      </div>
      {result.isError ? (
        <div className="empty-state">
          <AlertTriangle size={28} />
          <h2>Não foi possível carregar</h2>
          <p>{result.error.message}</p>
          <button
            className="secondary-button"
            onClick={() => {
              void result.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : result.isPending ? (
        <div className="catalog-loading" role="status">
          Carregando seus insumos e embalagens…
        </div>
      ) : result.data.items.length === 0 ? (
        <div className="empty-state">
          <PackageOpen size={36} />
          <h2>
            {term || kind !== "all"
              ? "Nenhum cadastro encontrado"
              : "Comece pelos seus ingredientes"}
          </h2>
          <p>
            {term || kind !== "all"
              ? "Ajuste a busca ou o filtro para encontrar o que procura."
              : "Cadastre insumos e embalagens para montar suas receitas e calcular os preços."}
          </p>
          {!term && kind === "all" && (
            <button className="primary-button compact-button" onClick={() => openEditor()}>
              <Plus size={18} /> Adicionar primeiro cadastro
            </button>
          )}
        </div>
      ) : (
        <div className="material-list">
          {result.data.items.map((item) => {
            const cost = unitCost(item);
            return (
              <article
                key={item.id}
                className="material-row"
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  if (t) touch.current = { x: t.clientX, y: t.clientY };
                }}
                onTouchEnd={(e) => {
                  const t = e.changedTouches[0];
                  if (
                    t &&
                    touch.current &&
                    touch.current.x - t.clientX > 70 &&
                    Math.abs(t.clientY - touch.current.y) < 40
                  )
                    setRevealed(item.id);
                  touch.current = null;
                }}
              >
                <span className={`material-icon ${item.kind}`} aria-hidden="true">
                  {item.kind === "ingredient" ? <FlaskConical size={21} /> : <Box size={21} />}
                </span>
                <div className="material-info">
                  <button className="material-name" onClick={() => openEditor(item)}>
                    {item.name}
                  </button>
                  <span className="material-meta">
                    {item.kind === "ingredient" ? "Insumo" : "Embalagem"} ·{" "}
                    {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(
                      item.package_quantity,
                    )}{" "}
                    {item.unit === "un" && item.package_quantity !== 1
                      ? "unidades"
                      : unitLabels[item.unit]}
                  </span>
                  {missingNutrition(item) && (
                    <span className="nutrition-alert">
                      <AlertTriangle size={12} /> Dados nutricionais incompletos
                    </span>
                  )}
                </div>
                <div className="material-price">
                  <strong>{money.format(item.package_price_cents / 100)}</strong>
                  <small>
                    {smallMoney.format(cost.value)} / {cost.unit}
                  </small>
                </div>
                <div className="material-actions">
                  <button
                    className="icon-button"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => openEditor(item)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className={`icon-button delete-button ${revealed === item.id ? "revealed" : ""}`}
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
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {total > pageSize && (
        <nav className="pagination" aria-label="Páginas de cadastros">
          <button
            className="secondary-button"
            disabled={page === 0 || result.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            <ArrowLeft size={16} /> Anterior
          </button>
          <span>
            {page + 1} de {Math.ceil(total / pageSize)}
          </span>
          <button
            className="secondary-button"
            disabled={(page + 1) * pageSize >= total || result.isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima <ArrowRight size={16} />
          </button>
        </nav>
      )}
      <p className="catalog-footnote">Atualize o preço pago quando o valor de compra mudar.</p>
      {editor && (
        <MaterialEditor
          ownerId={ownerId}
          online={online}
          {...editor}
          onClose={closeEditor}
          onSaved={(gone) => {
            setEditor(null);
            setDraft(null);
            setMessage(
              gone ? "Este cadastro já foi excluído e não será recriado." : "Cadastro salvo.",
            );
            void refresh();
          }}
        />
      )}
      <AlertDialog
        open={Boolean(remove)}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setRemove(null);
        }}
      >
        <AlertDialogContent className="delete-dialog">
          <AlertDialogTitle>Excluir {remove?.item.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            O cadastro será removido de todos os aparelhos. Esta ação não pode ser desfeita.
          </AlertDialogDescription>
          {deleteError && (
            <p className="notice danger" role="alert">
              {deleteError}
            </p>
          )}
          <div className="editor-actions">
            <AlertDialogCancel className="secondary-button" disabled={deleteBusy}>
              Cancelar
            </AlertDialogCancel>
            <button
              className="destructive-button"
              disabled={deleteBusy || !online}
              onClick={() => {
                void confirmDelete();
              }}
            >
              {deleteBusy ? "Excluindo…" : "Excluir cadastro"}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
