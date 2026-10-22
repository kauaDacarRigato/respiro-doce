import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Settings2, Wallet } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useCatalogSync } from "@/features/products/use-catalog-sync";
import { centsValue } from "@/features/products/recipe-domain";
import { dateLabel, saoPauloInput } from "@/features/sales/sale-domain";
import { CategoryPicker } from "@/features/expenses/category-picker";
import { readCash, readOpening } from "./finance-data";
import { FinanceTabs } from "./finance-tabs";
import { MoneyCard, FinancePagination } from "./finance-ui";
import { OpeningEditor } from "./opening-editor";
export function CashPage() {
  const { session } = useAuth();
  const owner = session!.user.id;
  const online = useCatalogSync(owner);
  const cache = useQueryClient();
  const [today] = useState(() => saoPauloInput().slice(0, 10));
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`);
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState(false);
  const [message, setMessage] = useState("");
  const valid = !from || !to || from <= to;
  const cash = useQuery({
    queryKey: ["cash", owner, from, to, kind, category, page],
    queryFn: ({ signal }) => readCash(from, to, kind, category, page, signal),
    enabled: valid,
    retry: false,
  });
  const opening = useQuery({
    queryKey: ["opening", owner],
    queryFn: ({ signal }) => readOpening(signal),
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && cash.data?.items.length === 0 && !cash.isFetching) setPage((p) => p - 1);
  }, [page, cash.data, cash.isFetching]);
  async function refresh() {
    for (const key of ["cash", "opening", "reports"]) {
      await cache.cancelQueries({ queryKey: [key, owner] });
      await cache.invalidateQueries({ queryKey: [key, owner] });
    }
  }
  return (
    <section className="catalog-page" aria-labelledby="cash-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">CADA MOVIMENTO CONTA</span>
          <h1 id="cash-title">Caixa</h1>
          <p>Vendas líquidas, gastos e o saldo do seu negócio em um só lugar.</p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary-button"
            disabled={!opening.data}
            onClick={() => setEditor(true)}
          >
            <Settings2 size={18} />
            Saldo inicial
          </button>
          <Link to="/gastos" className="primary-button compact-button">
            Gerenciar gastos
          </Link>
        </div>
      </header>
      <FinanceTabs />
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
      {opening.isError && (
        <p className="notice danger" role="alert">
          {opening.error.message}{" "}
          <button className="text-button" onClick={() => void opening.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      <div className="sales-filters cash-filters">
        <label className="field">
          De
          <input
            aria-label="Caixa a partir de"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
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
            aria-label="Caixa até"
            type="date"
            min="2000-01-01"
            max="2099-12-31"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field">
          Movimentações
          <select
            aria-label="Tipo de movimentação"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setCategory("all");
              setPage(0);
            }}
          >
            <option value="all">Todas</option>
            <option value="sale">Vendas</option>
            <option value="expense">Gastos</option>
            <option value="opening">Saldo inicial</option>
          </select>
        </label>
        {(kind === "all" || kind === "expense") && (
          <div className="field">
            <span>Categoria de gastos</span>
            <CategoryPicker
              owner={owner}
              value={category}
              filter
              onChange={(v) => {
                setCategory(v);
                setPage(0);
              }}
            />
          </div>
        )}
        <button
          className="text-button"
          onClick={() => {
            setFrom("");
            setTo("");
            setKind("all");
            setCategory("all");
            setPage(0);
          }}
        >
          Todo o histórico
        </button>
      </div>
      <p className="helper-note">
        Horário de São Paulo. Tipo e categoria filtram apenas a lista. Os cartões e o saldo de cada
        linha consideram todas as movimentações do período e o histórico anterior.
      </p>
      {!valid ? (
        <p className="notice warning" role="alert">
          A data inicial deve vir antes da data final.
        </p>
      ) : cash.isError ? (
        <div className="empty-state">
          <h2>Não foi possível carregar</h2>
          <p role="alert">{cash.error.message}</p>
          <button className="secondary-button" onClick={() => void cash.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : cash.isPending ? (
        <p role="status">Carregando seu caixa…</p>
      ) : (
        <>
          <div className="finance-current">
            <div>
              <span>Saldo até agora</span>
              <strong className={BigInt(cash.data.current_cents) < 0n ? "danger-text" : ""}>
                {centsValue(cash.data.current_cents)}
              </strong>
              <small>Todo o histórico até este momento, independente dos filtros.</small>
            </div>
            <Wallet size={32} aria-hidden="true" />
          </div>
          <div className="finance-grid">
            <MoneyCard label="Saldo anterior ao período" value={cash.data.previous_cents} />
            <MoneyCard
              label="Vendas líquidas no período"
              value={cash.data.incoming_cents}
              note="Vendas menos taxas de pagamento"
            />
            <MoneyCard label="Gastos no período" value={cash.data.expenses_cents} />
            <MoneyCard label="Saldo final do período" value={cash.data.closing_cents} signed />
          </div>
          <p className="finance-equation">
            Saldo anterior + vendas líquidas − gastos + saldo inicial lançado no período (
            {centsValue(cash.data.opening_cents)}) = saldo final.
          </p>
          <p className="helper-note">
            O caixa é calculado pelos lançamentos e pode incluir datas futuras no período
            selecionado. Custos de produção aparecem no lucro dos produtos e não geram outra saída
            automática.
          </p>
          <div className="finance-list-heading">
            <h2>Movimentações</h2>
            <span>
              {cash.data.total} {cash.data.total === 1 ? "lançamento" : "lançamentos"}
              {cash.isFetching ? " · Atualizando…" : ""}
            </span>
          </div>
          {cash.data.items.length === 0 ? (
            <div className="empty-state">
              <Wallet size={36} />
              <h2>Nenhuma movimentação neste filtro</h2>
              <p>Registre vendas e gastos ou ajuste o período para acompanhar seu caixa.</p>
              <Link to="/" className="secondary-button">
                Ir para vendas
              </Link>
            </div>
          ) : (
            <div className="recipe-list cash-list">
              {cash.data.items.map((e) => (
                <article className="recipe-card cash-entry" key={`${e.kind}-${e.id}`}>
                  <div className="recipe-card-heading">
                    <div>
                      <span className={`cash-kind ${e.kind}`}>
                        {e.kind === "sale"
                          ? "Venda"
                          : e.kind === "expense"
                            ? "Gasto"
                            : "Saldo inicial"}
                      </span>
                      <h3>{e.description}</h3>
                      <p>
                        {dateLabel(e.occurred_at)}
                        {e.kind === "expense" ? ` · ${e.category_name ?? "Sem categoria"}` : ""}
                      </p>
                      {e.kind === "sale" && (
                        <small>
                          Bruto {centsValue(e.gross_cents)} · Taxa {centsValue(e.fee_cents)}
                        </small>
                      )}
                    </div>
                    <strong
                      className={BigInt(e.delta_cents) < 0n ? "danger-text" : "positive-money"}
                    >
                      {centsValue(e.delta_cents)}
                    </strong>
                  </div>
                  <div className="cash-entry-balance">
                    <span>Saldo após o lançamento</span>
                    <b className={BigInt(e.balance_cents) < 0n ? "danger-text" : ""}>
                      {centsValue(e.balance_cents)}
                    </b>
                  </div>
                </article>
              ))}
            </div>
          )}
          <FinancePagination page={page} total={cash.data.total} onChange={setPage} />
        </>
      )}
      {editor && opening.data && (
        <OpeningEditor
          owner={owner}
          opening={opening.data}
          online={online}
          onClose={() => setEditor(false)}
          onSaved={() => {
            setEditor(false);
            setMessage("Saldo inicial salvo. Os saldos foram recalculados.");
            void refresh();
          }}
        />
      )}
    </section>
  );
}
