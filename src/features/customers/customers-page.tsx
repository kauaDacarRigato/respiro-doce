import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-provider";
import { useCatalogSync } from "@/features/products/use-catalog-sync";
import { centsValue } from "@/features/products/recipe-domain";
import {
  listCustomers,
  listSales,
  sendCommerceCommand,
  salesPageSize,
  type CommerceCommand,
} from "@/features/sales/sale-data";
import { dateLabel, type Customer } from "@/features/sales/sale-domain";
import { SaleCard } from "@/features/sales/sale-card";
function CustomerHistory({
  customer,
  owner,
  onClose,
}: {
  customer: Customer;
  owner: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const result = useQuery({
    queryKey: ["sales", owner, "customer-history", customer.id, page],
    queryFn: ({ signal }) => listSales("", "", "all", page, signal, customer.id),
    retry: false,
  });
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="bottom" className="material-sheet">
        <div className="sheet-grabber" aria-hidden="true" />
        <SheetTitle>Compras de {customer.name}</SheetTitle>
        <SheetDescription>Vendas ainda vinculadas a este cliente.</SheetDescription>
        {result.isPending ? (
          <p role="status">Carregando compras…</p>
        ) : result.isError ? (
          <p className="notice danger" role="alert">
            {result.error.message}
            <button className="text-button" onClick={() => void result.refetch()}>
              Tentar novamente
            </button>
          </p>
        ) : result.data.items.length === 0 ? (
          <p className="notice warning">
            Nenhuma compra vinculada. O cadastro pode ter sido excluído ou estar sem vendas.
          </p>
        ) : (
          <div className="customer-history">
            {result.data.items.map((s) => (
              <SaleCard key={s.id} sale={s} />
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
      </SheetContent>
    </Sheet>
  );
}
export function CustomersPage() {
  const { session } = useAuth();
  const owner = session!.user.id;
  const online = useCatalogSync(owner);
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<Customer | null>(null);
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState<{ customer: Customer; command: CommerceCommand } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const result = useQuery({
    queryKey: ["customers", owner, term, page],
    queryFn: ({ signal }) => listCustomers(term, page, signal),
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && result.data?.items.length === 0 && !result.isFetching) setPage((p) => p - 1);
  }, [page, result.data, result.isFetching]);
  async function confirmDelete() {
    if (!remove || lock.current || !online) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await sendCommerceCommand(remove.command);
      setRemove(null);
      setHistory(null);
      setMessage("Cliente excluído. As vendas mantêm seus valores, sem os dados pessoais.");
      for (const key of ["customers", "sales"]) {
        await cache.cancelQueries({ queryKey: [key, owner] });
        await cache.invalidateQueries({ queryKey: [key, owner] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a exclusão.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="catalog-page" aria-labelledby="customers-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">QUEM ESCOLHE SEUS DOCES</span>
          <h1 id="customers-title">Clientes</h1>
          <p>
            As vendas identificadas reúnem as compras pelo telefone. O nome acompanha a compra mais
            recente.
          </p>
        </div>
      </header>
      {message && (
        <p className="notice success" role="status">
          {message}
        </p>
      )}
      {!online && (
        <p className="notice warning">Sem conexão. Os dados podem estar desatualizados.</p>
      )}
      <div className="catalog-tools">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar clientes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome ou telefone…"
          />
        </label>
      </div>
      <div className="catalog-summary">
        <span>{result.isPending ? "Carregando…" : `${result.data?.total ?? 0} clientes`}</span>
      </div>
      {result.isError ? (
        <div className="empty-state">
          <p role="alert">{result.error.message}</p>
          <button className="secondary-button" onClick={() => void result.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : result.isPending ? (
        <p role="status">Carregando clientes…</p>
      ) : result.data.items.length === 0 ? (
        <div className="empty-state">
          <Users size={36} />
          <h2>{term ? "Nenhum cliente encontrado" : "Seus clientes aparecem aqui"}</h2>
          <p>Ao registrar uma venda, escolha Identificar cliente e preencha nome e telefone.</p>
        </div>
      ) : (
        <div className="recipe-list">
          {result.data.items.map((c) => (
            <article className="recipe-card customer-card" key={c.id}>
              <div className="recipe-card-heading">
                <div>
                  <h2>{c.name}</h2>
                  <p>{c.phone}</p>
                </div>
                <button
                  className="icon-button danger-text"
                  aria-label={`Excluir cliente ${c.name}`}
                  onClick={() => {
                    setRemove({
                      customer: c,
                      command: {
                        commandId: crypto.randomUUID(),
                        entity: "customer",
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
              <dl className="cost-breakdown">
                <div>
                  <dt>Itens comprados</dt>
                  <dd>{BigInt(c.items).toLocaleString("pt-BR")}</dd>
                </div>
                <div>
                  <dt>Total comprado</dt>
                  <dd>{centsValue(c.total_cents)}</dd>
                </div>
                <div>
                  <dt>Última compra</dt>
                  <dd>{c.last_purchase ? dateLabel(c.last_purchase) : "Sem compras"}</dd>
                </div>
              </dl>
              <button className="secondary-button" onClick={() => setHistory(c)}>
                Ver compras
              </button>
            </article>
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
      {history && (
        <CustomerHistory customer={history} owner={owner} onClose={() => setHistory(null)} />
      )}
      <AlertDialog
        open={remove !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemove(null);
        }}
      >
        <AlertDialogContent className="delete-dialog">
          <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            O nome e o telefone de {remove?.customer.name} serão removidos deste cadastro e das
            vendas vinculadas. As vendas e seus valores financeiros permanecem, sem identificação.
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
              {busy ? "Excluindo…" : "Excluir cliente"}
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
