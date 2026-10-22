import { centsValue } from "@/features/products/recipe-domain";
export function MoneyCard({
  label,
  value,
  note,
  signed = false,
}: {
  label: string;
  value: string;
  note?: string;
  signed?: boolean;
}) {
  return (
    <article className="finance-metric">
      <span>{label}</span>
      <strong
        className={
          BigInt(value) < 0n ? "danger-text" : signed && BigInt(value) > 0n ? "positive-money" : ""
        }
      >
        {centsValue(value)}
      </strong>
      {note && <small>{note}</small>}
    </article>
  );
}
export function FinancePagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total <= 20) return null;
  return (
    <div className="catalog-pagination">
      <button className="secondary-button" disabled={page === 0} onClick={() => onChange(page - 1)}>
        Anterior
      </button>
      <span>
        Página {page + 1} de {Math.ceil(total / 20)}
      </span>
      <button
        className="secondary-button"
        disabled={(page + 1) * 20 >= total}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
