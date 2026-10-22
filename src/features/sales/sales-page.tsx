import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ReceiptText, Settings2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/auth-provider";
import { useCatalogSync } from "@/features/products/use-catalog-sync";
import { removeDraft } from "@/lib/drafts";
import { listSales, salesPageSize, sendCommerceCommand, type CommerceCommand } from "./sale-data";
import { paymentLabels, type Sale } from "./sale-domain";
import { getSaleDraft, type SaleDraft } from "./sale-draft";
import { SaleEditor } from "./sale-editor";
import { FeeEditor } from "./fee-editor";
import { SaleCard } from "./sale-card";
export function SalesPage() {
  const { session } = useAuth();
  const owner = session!.user.id;
  const online = useCatalogSync(owner);
  const cache = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payment, setPayment] = useState("all");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ item?: Sale; restored?: SaleDraft } | null>(null);
  const [draft, setDraft] = useState(() => getSaleDraft(owner));
  const [fees, setFees] = useState(false);
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState<{ sale: Sale; command: CommerceCommand } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const validPeriod = !from || !to || from <= to;
  const result = useQuery({
    queryKey: ["sales", owner, from, to, payment, page],
    queryFn: ({ signal }) => listSales(from, to, payment, page, signal),
    enabled: validPeriod,
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && result.data?.items.length === 0 && !result.isFetching) setPage((p) => p - 1);
  }, [page, result.data, result.isFetching]);
  async function refresh() {
    for (const key of ["sales", "customers", "fees", "sale-preview"]) {
      await cache.cancelQueries({ queryKey: [key, owner] });
      await cache.invalidateQueries({ queryKey: [key, owner] });
    }
  }
  function open(sale?: Sale) {
    const saved = getSaleDraft(owner);
    if (saved && (!sale || saved.id === sale.id)) {
      setEditor({ restored: saved, ...(sale ? { item: sale } : {}) });
      return;
    }
    if (
      saved &&
      !window.confirm("Já há uma venda em rascunho. Deseja substituí-la por esta edição?")
    )
      return;
    setMessage("");
    setEditor(sale ? { item: sale } : {});
  }
  async function confirmDelete() {
    if (!remove || lock.current || !online) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await sendCommerceCommand(remove.command);
      setRemove(null);
      setMessage("Venda excluída. Os totais dos clientes foram atualizados.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a exclusão.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="catalog-page" aria-labelledby="sales-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CADA VENDA CONTA</span>
          <h1 id="sales-title">Vendas</h1>
          <p>Registre suas vendas e veja quanto cada uma deixou para o negócio.</p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={() => setFees(true)}>
            <Settings2 size={18} /> Taxas de cartão
          </button>
          <button className="primary-button compact-button" onClick={() => open()}>
            <Plus size={19} /> Nova venda
          </button>
        </div>
      </header>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {!online && (
        <p className="notice warning">
          Sem conexão. Os dados podem estar desatualizados; nenhuma venda será confirmada offline.
        </p>
      )}
      {draft && !editor && (
        <div className="draft-banner">
          <div>
            <strong>Você tem uma venda em rascunho</strong>
            <small>Confira os dados antes de salvar.</small>
          </div>
          <div>
            <button className="text-button" onClick={() => setEditor({ restored: draft })}>
              Retomar
            </button>
            <button
              className="icon-button"
              aria-label="Descartar rascunho de venda"
              onClick={() => {
                removeDraft(owner, "sale");
                setDraft(null);
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      )}
      <div className="sales-filters">
        <label className="field">
          De
          <input
            aria-label="Vendas a partir de"
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
            aria-label="Vendas até"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Pagamento
          <select
            aria-label="Filtrar pagamento"
            value={payment}
            onChange={(e) => {
              setPayment(e.target.value);
              setPage(0);
            }}
          >
            <option value="all">Todos</option>
            {Object.entries(paymentLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          onClick={() => {
            setFrom("");
            setTo("");
            setPayment("all");
            setPage(0);
          }}
        >
          Limpar filtros
        </button>
      </div>
      <p className="helper-note">Datas no horário de São Paulo.</p>
      {!validPeriod ? (
        <p className="notice warning" role="alert">
          A data inicial deve vir antes da data final.
        </p>
      ) : (
        <>
          <div className="catalog-summary">
            <span>{result.isPending ? "Carregando…" : `${result.data?.total ?? 0} vendas`}</span>
            {result.isFetching && !result.isPending && <span role="status">Atualizando…</span>}
          </div>
          {result.isError ? (
            <div className="empty-state">
              <h2>Não foi possível carregar</h2>
              <p role="alert">{result.error.message}</p>
              <button className="secondary-button" onClick={() => void result.refetch()}>
                Tentar novamente
              </button>
            </div>
          ) : result.isPending ? (
            <p role="status">Carregando suas vendas…</p>
          ) : result.data.items.length === 0 ? (
            <div className="empty-state">
              <ReceiptText size={36} />
              <h2>
                {from || to || payment !== "all"
                  ? "Nenhuma venda neste filtro"
                  : "Sua primeira venda começa aqui"}
              </h2>
              <p>Escolha uma receita completa e registre o pagamento e o cliente.</p>
              <button className="primary-button compact-button" onClick={() => open()}>
                Registrar venda
              </button>
            </div>
          ) : (
            <div className="recipe-list">
              {result.data.items.map((s) => (
                <SaleCard
                  key={s.id}
                  sale={s}
                  onEdit={open}
                  onDelete={(sale) => {
                    setRemove({
                      sale,
                      command: {
                        commandId: crypto.randomUUID(),
                        entity: "sale",
                        action: "delete",
                        id: sale.id,
                        payload: {},
                      },
                    });
                    setError("");
                  }}
                />
              ))}
            </div>
          )}
          {(result.data?.total ?? 0) > salesPageSize && (
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
                disabled={(page + 1) * salesPageSize >= (result.data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </>
      )}
      {editor && (
        <SaleEditor
          ownerId={owner}
          {...editor}
          online={online}
          onClose={() => {
            setEditor(null);
            setDraft(getSaleDraft(owner));
          }}
          onSaved={(gone) => {
            setEditor(null);
            setDraft(null);
            setMessage(
              gone
                ? "Esta venda já foi excluída. Lista atualizada."
                : "Venda salva com os custos e as taxas guardados.",
            );
            void refresh();
          }}
        />
      )}
      {fees && (
        <FeeEditor
          owner={owner}
          online={online}
          onClose={() => setFees(false)}
          onSaved={() => {
            setFees(false);
            setMessage("Taxas salvas. As vendas anteriores mantêm seus valores históricos.");
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
          <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
          <AlertDialogDescription>
            A venda de {remove?.sale.product_name} será excluída e deixará de participar dos totais.
            O cadastro do cliente permanece.
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
              {busy ? "Excluindo…" : "Excluir venda"}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
