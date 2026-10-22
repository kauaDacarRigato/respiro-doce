import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartNoAxesCombined } from "lucide-react";
import { useAuth } from "@/features/auth/auth-provider";
import { useCatalogSync } from "@/features/products/use-catalog-sync";
import { centsValue } from "@/features/products/recipe-domain";
import { saoPauloInput } from "@/features/sales/sale-domain";
import { readReport } from "@/features/cash/finance-data";
import {
  barHeights,
  bucketLabel,
  type FinanceTotals,
  type ReportMode,
} from "@/features/cash/finance-domain";
import { MoneyCard, FinancePagination } from "@/features/cash/finance-ui";
type ChartMetric = "product_profit_cents" | "gross_cents" | "cash_flow_cents";
const chartLabels: Record<ChartMetric, string> = {
  product_profit_cents: "Lucro dos produtos",
  gross_cents: "Vendas brutas",
  cash_flow_cents: "Fluxo de caixa",
};
export function ReportsPage() {
  const { session } = useAuth();
  const owner = session!.user.id;
  const online = useCatalogSync(owner);
  const [mode, setMode] = useState<ReportMode>("month");
  const [date, setDate] = useState(() => saoPauloInput().slice(0, 10));
  const [page, setPage] = useState(0);
  const [metric, setMetric] = useState<ChartMetric>("product_profit_cents");
  const valid = /^20\d{2}-\d{2}-\d{2}$/.test(date);
  const report = useQuery({
    queryKey: ["reports", owner, mode, date, page],
    queryFn: ({ signal }) => readReport(mode, date, page, signal),
    enabled: valid,
    retry: false,
  });
  useEffect(() => {
    if (page > 0 && report.data?.products.length === 0 && !report.isFetching) setPage((p) => p - 1);
  }, [page, report.data, report.isFetching]);
  const heights = barHeights(report.data?.buckets.map((b) => b.metrics[metric]) ?? []);
  const number = (n: string) => BigInt(n).toLocaleString("pt-BR");
  const countLabel = (n: string, singular: string, plural: string) =>
    `${number(n)} ${n === "1" ? singular : plural}`;
  const metrics = (m: FinanceTotals) => (
    <>
      <MoneyCard label="Vendas brutas" value={m.gross_cents} />
      <MoneyCard label="Custo de produção vendido" value={m.production_cents} />
      <MoneyCard label="Taxas de pagamento" value={m.fee_cents} />
      <MoneyCard
        label="Lucro dos produtos"
        value={m.product_profit_cents}
        signed
        note="Vendas − produção − taxas"
      />
      <MoneyCard label="Vendas líquidas" value={m.net_cents} note="Vendas − taxas" />
      <MoneyCard label="Gastos pagos" value={m.expense_cents} />
      <MoneyCard
        label="Fluxo de caixa do período"
        value={m.cash_flow_cents}
        signed
        note="Vendas líquidas − gastos; sem saldo inicial"
      />
    </>
  );
  return (
    <section className="catalog-page" aria-labelledby="reports-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">ENTENDA SEUS RESULTADOS</span>
          <h1 id="reports-title">Resumo</h1>
          <p>Veja o desempenho por dia, mês, ano e produto.</p>
        </div>
      </header>
      {!online && (
        <p className="notice warning">Sem conexão. Os dados podem estar desatualizados.</p>
      )}
      <div className="sales-filters report-filters">
        <label className="field">
          Agrupar por
          <select
            aria-label="Período do resumo"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ReportMode);
              setPage(0);
            }}
          >
            <option value="day">Dia</option>
            <option value="month">Mês</option>
            <option value="year">Ano</option>
          </select>
        </label>
        {mode === "day" ? (
          <label className="field">
            Dia
            <input
              aria-label="Dia do resumo"
              required
              type="date"
              min="2000-01-01"
              max="2099-12-31"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(0);
              }}
            />
          </label>
        ) : mode === "month" ? (
          <label className="field">
            Mês
            <input
              aria-label="Mês do resumo"
              required
              type="month"
              min="2000-01"
              max="2099-12"
              value={date.slice(0, 7)}
              onChange={(e) => {
                setDate(e.target.value ? `${e.target.value}-01` : "");
                setPage(0);
              }}
            />
          </label>
        ) : (
          <label className="field">
            Ano
            <select
              aria-label="Ano do resumo"
              value={date.slice(0, 4) || "2026"}
              onChange={(e) => {
                setDate(`${e.target.value}-01-01`);
                setPage(0);
              }}
            >
              {Array.from({ length: 100 }, (_, i) => String(2000 + i)).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="helper-note">
        Datas no horário de São Paulo. Vendas usam os preços, custos e taxas guardados no momento de
        cada lançamento.
      </p>
      {!valid ? (
        <p className="notice warning">Selecione um período válido.</p>
      ) : report.isError ? (
        <div className="empty-state">
          <h2>Não foi possível carregar</h2>
          <p role="alert">{report.error.message}</p>
          <button className="secondary-button" onClick={() => void report.refetch()}>
            Tentar novamente
          </button>
        </div>
      ) : report.isPending ? (
        <p role="status">Calculando seu resumo…</p>
      ) : (
        <>
          <div className="finance-list-heading">
            <p>
              {report.data.start_date.split("-").reverse().join("/")} a{" "}
              {report.data.end_date.split("-").reverse().join("/")}
            </p>
            <span>
              {countLabel(report.data.summary.sales, "venda", "vendas")} ·{" "}
              {countLabel(report.data.summary.items, "unidade", "unidades")}
              {report.isFetching ? " · Atualizando…" : ""}
            </span>
          </div>
          <div className="finance-grid report-metrics">{metrics(report.data.summary)}</div>
          <p className="finance-equation">
            O lucro dos produtos considera o custo de produção e as taxas. Os gastos pagos aparecem
            separadamente; este indicador não representa o lucro líquido do negócio. O saldo inicial
            fica somente no caixa.
          </p>
          <section className="finance-chart" aria-labelledby="chart-title">
            <div className="finance-list-heading">
              <h2 id="chart-title">Evolução no período</h2>
              <label className="field">
                <span className="sr-only">Indicador do gráfico</span>
                <select
                  aria-label="Indicador do gráfico"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as ChartMetric)}
                >
                  {Object.entries(chartLabels).map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {heights.every((h) => h === 0) && (
              <p className="helper-note">Sem valores para este indicador no período.</p>
            )}
            <div className="finance-chart-scroll">
              <div
                className="finance-bars"
                role="img"
                aria-label={`${chartLabels[metric]} por ${mode === "day" ? "hora" : mode === "month" ? "dia" : "mês"}. Valores detalhados na tabela abaixo.`}
              >
                {report.data.buckets.map((b, i) => (
                  <div
                    className="finance-bar-column"
                    key={b.key}
                    title={`${bucketLabel(b.key, mode)}: ${centsValue(b.metrics[metric])}`}
                  >
                    <div className="finance-bar-half upper">
                      {BigInt(b.metrics[metric]) > 0n && (
                        <span style={{ height: `${Math.max(1, heights[i] ?? 0)}%` }} />
                      )}
                    </div>
                    <div className="finance-bar-half lower">
                      {BigInt(b.metrics[metric]) < 0n && (
                        <span style={{ height: `${Math.max(1, heights[i] ?? 0)}%` }} />
                      )}
                    </div>
                    <small
                      className={
                        i === 0 ||
                        i === report.data.buckets.length - 1 ||
                        mode === "year" ||
                        ((mode === "month" ? (i + 1) % 5 === 0 : i % 6 === 0) &&
                          i < report.data.buckets.length - 2)
                          ? ""
                          : "chart-label-secondary"
                      }
                    >
                      {bucketLabel(b.key, mode)}
                    </small>
                  </div>
                ))}
              </div>
            </div>
            <p className="helper-note">
              Verde: positivo · Vermelho: negativo · Cada coluna inclui os intervalos sem
              movimentação.
            </p>
            <details className="finance-details">
              <summary>Ver valores do gráfico</summary>
              <div
                className="finance-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Valores detalhados do gráfico"
              >
                <table>
                  <caption>{chartLabels[metric]}</caption>
                  <thead>
                    <tr>
                      <th>{mode === "day" ? "Hora" : mode === "month" ? "Dia" : "Mês"}</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.buckets.map((b) => (
                      <tr key={b.key}>
                        <th scope="row">{bucketLabel(b.key, mode)}</th>
                        <td className={BigInt(b.metrics[metric]) < 0n ? "danger-text" : ""}>
                          {centsValue(b.metrics[metric])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <div className="finance-list-heading">
            <h2>Resultado por produto</h2>
            <span>
              {report.data.product_count} {report.data.product_count === 1 ? "produto" : "produtos"}
            </span>
          </div>
          <p className="helper-note">
            Ordenados por vendas brutas. O nome é o último registrado no período; receitas excluídas
            mantêm seu histórico. Gastos e saldo inicial não são distribuídos entre os produtos.
          </p>
          {report.data.products.length === 0 ? (
            <div className="empty-state">
              <ChartNoAxesCombined size={36} />
              <h2>Nenhuma venda neste período</h2>
              <p>As vendas registradas aparecerão aqui com seus valores históricos.</p>
            </div>
          ) : (
            <div className="recipe-list">
              {report.data.products.map((p) => (
                <article className="recipe-card product-report" key={p.id}>
                  <div className="recipe-card-heading">
                    <div>
                      <h3>{p.name}</h3>
                      <p>
                        {countLabel(p.metrics.items, "unidade", "unidades")} ·{" "}
                        {countLabel(p.metrics.sales, "venda", "vendas")}
                      </p>
                    </div>
                    <div className="product-report-profit">
                      <small>Lucro dos produtos</small>
                      <strong
                        className={
                          BigInt(p.metrics.product_profit_cents) < 0n
                            ? "danger-text"
                            : "positive-money"
                        }
                      >
                        {centsValue(p.metrics.product_profit_cents)}
                      </strong>
                    </div>
                  </div>
                  <dl className="product-report-values">
                    <div>
                      <dt>Vendas brutas</dt>
                      <dd>{centsValue(p.metrics.gross_cents)}</dd>
                    </div>
                    <div>
                      <dt>Produção</dt>
                      <dd>{centsValue(p.metrics.production_cents)}</dd>
                    </div>
                    <div>
                      <dt>Taxas</dt>
                      <dd>{centsValue(p.metrics.fee_cents)}</dd>
                    </div>
                    <div>
                      <dt>Vendas líquidas</dt>
                      <dd>{centsValue(p.metrics.net_cents)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
          <FinancePagination page={page} total={report.data.product_count} onChange={setPage} />
        </>
      )}
    </section>
  );
}
