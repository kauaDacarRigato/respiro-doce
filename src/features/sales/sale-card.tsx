import { Pencil, Trash2 } from "lucide-react";
import { centsValue } from "@/features/products/recipe-domain";
import { dateLabel, paymentLabels, type Sale } from "./sale-domain";
import { SaleTotals } from "./sale-totals";
export function SaleCard({
  sale,
  onEdit,
  onDelete,
}: {
  sale: Sale;
  onEdit?: (sale: Sale) => void;
  onDelete?: (sale: Sale) => void;
}) {
  return (
    <article className="recipe-card sale-card">
      <div className="recipe-card-heading">
        <div>
          <h2>{sale.product_name}</h2>
          <p>
            {dateLabel(sale.occurred_at)} · {paymentLabels[sale.payment]}
          </p>
        </div>
        {onEdit && onDelete && (
          <div className="row-actions">
            <button
              className="icon-button"
              aria-label={`Editar venda de ${sale.product_name}`}
              onClick={() => onEdit(sale)}
            >
              <Pencil size={18} />
            </button>
            <button
              className="icon-button danger-text"
              aria-label={`Excluir venda de ${sale.product_name}`}
              onClick={() => onDelete(sale)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      <p className="sale-customer">
        {sale.customer_name ?? "Sem identificação"}
        {sale.customer_phone && <small>{sale.customer_phone}</small>}
      </p>
      <div className="recipe-card-prices">
        <div>
          <span>
            {sale.quantity.toLocaleString("pt-BR")} × {centsValue(sale.unit_price_cents)}
          </span>
          <strong>{centsValue(sale.gross_cents)}</strong>
        </div>
        <div>
          <span>Lucro do produto</span>
          <b className={BigInt(sale.profit_cents) < 0n ? "loss-value" : "profit-value"}>
            {centsValue(sale.profit_cents)}
          </b>
        </div>
      </div>
      <details className="recipe-card-details">
        <summary>Valores e custos históricos</summary>
        <SaleTotals quote={sale} />
      </details>
    </article>
  );
}
