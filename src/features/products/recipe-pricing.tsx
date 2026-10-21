import { centsValue, moneyValue, type RecipePricing } from "./recipe-domain";
export function RecipePricingView({
  pricing,
  fee,
}: {
  pricing: RecipePricing;
  fee: string | number;
}) {
  return (
    <section className="recipe-pricing" aria-label="Memória de cálculo">
      <div className="recipe-price-hero">
        <span>Preço sugerido por unidade</span>
        <strong>{centsValue(pricing.suggested_cents)}</strong>
        <small>
          {pricing.ready
            ? `Multiplicador 3 · taxa estimada de ${String(fee).replace(".", ",")}%`
            : pricing.reason}
        </small>
      </div>
      <dl className="cost-breakdown">
        <div>
          <dt>Ingredientes do lote</dt>
          <dd>{moneyValue(pricing.ingredients)}</dd>
        </div>
        <div>
          <dt>Embalagens do lote</dt>
          <dd>{moneyValue(pricing.packaging)}</dd>
        </div>
        <div>
          <dt>Subtotal direto</dt>
          <dd>{moneyValue(pricing.direct)}</dd>
        </div>
        <div>
          <dt>Custos indiretos</dt>
          <dd>{moneyValue(pricing.indirect)}</dd>
        </div>
        <div className="cost-total">
          <dt>Produção do lote</dt>
          <dd>{moneyValue(pricing.lot)}</dd>
        </div>
        {pricing.ready && (
          <>
            <div>
              <dt>Produção por unidade</dt>
              <dd>{moneyValue(pricing.unit_cost!)}</dd>
            </div>
            <div>
              <dt>Taxa estimada por unidade</dt>
              <dd>{centsValue(pricing.fee_cents)}</dd>
            </div>
            <div>
              <dt>Custo com taxa estimada</dt>
              <dd>{centsValue(pricing.total_unit_cents)}</dd>
            </div>
            <div className="estimated-profit">
              <dt>Lucro estimado por unidade</dt>
              <dd>{centsValue(pricing.profit_cents)}</dd>
            </div>
          </>
        )}
      </dl>
      <details className="calculation-details">
        <summary>Como calculamos</summary>
        <p>
          Subtotal direto × (1 + indiretos ÷ 100) ÷ rendimento × 3 ÷ (1 − taxa ÷ 100). Arredondamos
          o preço final para centavos.
        </p>
        {pricing.unit_cost && (
          <p>
            Custo de produção usado na fórmula: R$ {pricing.unit_cost.replace(".", ",")}. O cálculo
            mantém a precisão antes do arredondamento.
          </p>
        )}
        <p>
          A taxa e o lucro são estimativas. Dinheiro e Pix terão taxa zero na venda. Os gastos
          gerais do negócio são registrados separadamente.
        </p>
        <p>
          Peso bruto alimentício dos ingredientes:{" "}
          {pricing.raw_edible_g === null
            ? "indisponível: faltam ingredientes ou equivalências de peso."
            : `${Number(pricing.raw_edible_g).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} g.`}{" "}
          Embalagens não entram nesse peso. O peso final após o preparo é informado por você.
        </p>
      </details>
    </section>
  );
}
