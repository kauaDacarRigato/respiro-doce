import { Link } from "@tanstack/react-router";
export function FinanceTabs() {
  return (
    <nav className="product-tabs" aria-label="Área financeira">
      <Link to="/caixa" activeProps={{ "aria-current": "page" }}>
        Caixa
      </Link>
      <Link to="/gastos" activeProps={{ "aria-current": "page" }}>
        Gastos
      </Link>
    </nav>
  );
}
