import { centsValue } from "@/features/products/recipe-domain";
import type { SaleQuote } from "./sale-domain";
export function SaleTotals({
  quote,
}: {
  quote: Omit<SaleQuote, "signature" | "historical" | "product_name">;
}) {
  return (
    <section className="sale-totals" aria-label="Valores da venda">
      <div className="sale-total-hero">
        <span>Valor da venda</span>
        <strong>{centsValue(quote.gross_cents)}</strong>
      </div>
      <dl className="cost-breakdown">
        <div>
          <dt>Custo de produção</dt>
          <dd>{centsValue(quote.production_cents)}</dd>
        </div>
        <div>
          <dt>Taxa ({quote.applied_fee_percent.replace(".", ",")}%)</dt>
          <dd>{centsValue(quote.fee_cents)}</dd>
        </div>
        <div>
          <dt>Custo total com taxa</dt>
          <dd>{centsValue(quote.total_cost_cents)}</dd>
        </div>
        <div className="cost-total">
          <dt>Entrada líquida</dt>
          <dd>{centsValue(quote.net_cents)}</dd>
        </div>
        <div>
          <dt>Lucro do produto</dt>
          <dd className={BigInt(quote.profit_cents) < 0n ? "loss-value" : "profit-value"}>
            {centsValue(quote.profit_cents)}
          </dd>
        </div>
      </dl>
      <p className="helper-note">
        A entrada líquida desconta a taxa do pagamento. O lucro também desconta a produção; gastos
        gerais são tratados separadamente.
      </p>
      <details className="calculation-details">
        <summary>Custos e taxas guardados nesta venda</summary>
        <p>
          Produção unitária exata: R$ {quote.unit_cost.replace(".", ",")}. Débito:{" "}
          {quote.debit_fee_percent}%. Crédito: {quote.credit_fee_percent}%. Dinheiro e Pix: 0%.
        </p>
        <p>
          A taxa é arredondada uma vez sobre o valor bruto total. A produção é arredondada depois de
          multiplicar o custo unitário pela quantidade.
        </p>
      </details>
    </section>
  );
}
