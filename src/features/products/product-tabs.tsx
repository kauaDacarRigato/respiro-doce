import { Link } from "@tanstack/react-router";
export function ProductTabs({ active }: { active: "materials" | "recipes" }) {
  return (
    <nav className="product-tabs" aria-label="Cadastros de produtos">
      <Link to="/produtos" aria-current={active === "materials" ? "page" : undefined}>
        Insumos e embalagens
      </Link>
      <Link to="/receitas" aria-current={active === "recipes" ? "page" : undefined}>
        Receitas
      </Link>
    </nav>
  );
}
