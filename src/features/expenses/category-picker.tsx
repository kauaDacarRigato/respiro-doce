import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { categoryPageSize, listCategories, readCategory } from "./expense-data";
export function CategoryPicker({
  owner,
  value,
  onChange,
  filter = false,
}: {
  owner: string;
  value: string;
  onChange: (id: string) => void;
  filter?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const selected = useQuery({
    queryKey: ["expense-categories", owner, "selected", value],
    queryFn: ({ signal }) => readCategory(value, signal),
    enabled: !["", "all", "none"].includes(value),
    retry: false,
  });
  const result = useQuery({
    queryKey: ["expense-categories", owner, "picker", term, page],
    queryFn: ({ signal }) => listCategories(term, page, signal),
    enabled: open,
    retry: false,
  });
  const label =
    value === "all"
      ? "Todas as categorias"
      : !value || value === "none"
        ? "Sem categoria"
        : selected.isPending
          ? "Carregando categoria…"
          : selected.isError
            ? "Categoria não conferida"
            : (selected.data?.name ?? "Categoria excluída");
  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }
  return (
    <div className="category-picker">
      <button
        type="button"
        className="secondary-button product-choice"
        aria-label={filter ? "Filtrar categoria" : "Selecionar categoria"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div className="recipe-picker">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label={filter ? "Buscar categoria do filtro" : "Buscar categoria"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoria…"
            />
          </label>
          {filter && (
            <button type="button" onClick={() => choose("all")}>
              Todas as categorias
            </button>
          )}
          <button type="button" onClick={() => choose(filter ? "none" : "")}>
            Sem categoria
          </button>
          {result.isPending ? (
            <p role="status">Carregando…</p>
          ) : result.isError ? (
            <p role="alert">
              {result.error.message}
              <button type="button" className="text-button" onClick={() => void result.refetch()}>
                Tentar novamente
              </button>
            </p>
          ) : (
            <>
              {result.data.items.length === 0 && <p>Nenhuma categoria encontrada.</p>}
              {result.data.items.map((c) => (
                <button key={c.id} type="button" onClick={() => choose(c.id)}>
                  {c.name}
                </button>
              ))}
              <div className="picker-pagination">
                <button
                  type="button"
                  className="text-button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </button>
                <span>{page + 1}</span>
                <button
                  type="button"
                  className="text-button"
                  disabled={(page + 1) * categoryPageSize >= result.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {selected.isError && (
        <p className="notice warning">
          {selected.error.message}
          <button type="button" className="text-button" onClick={() => void selected.refetch()}>
            Conferir novamente
          </button>
        </p>
      )}
    </div>
  );
}
