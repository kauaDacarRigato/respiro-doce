import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { saveDraft, removeDraft } from "@/lib/drafts";
import { listRecipes } from "@/features/products/recipe-data";
import { MaterialCommandError, pageSize } from "@/features/products/material-data";
import { centsValue } from "@/features/products/recipe-domain";
import {
  emptySaleForm,
  formFromSale,
  paymentLabels,
  salePayload,
  type Sale,
  type SaleForm,
} from "./sale-domain";
import { listCustomers, quoteSale, sendCommerceCommand, type CommerceCommand } from "./sale-data";
import { type SaleDraft } from "./sale-draft";
import { SaleTotals } from "./sale-totals";
export function SaleEditor({
  ownerId,
  item,
  restored,
  online,
  onClose,
  onSaved,
}: {
  ownerId: string;
  item?: Sale;
  restored?: SaleDraft;
  online: boolean;
  onClose: () => void;
  onSaved: (gone: boolean) => void;
}) {
  const [form, setForm] = useState(
    () => restored?.form ?? (item ? formFromSale(item) : emptySaleForm()),
  );
  const [id] = useState(() => restored?.id ?? item?.id ?? crypto.randomUUID());
  const action = restored?.action ?? (item ? "update" : "create");
  const [originalRecipeId] = useState(
    () => restored?.originalRecipeId ?? item?.recipe_source_id ?? null,
  );
  const [pending, setPending] = useState<CommerceCommand | null>(restored?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [draftAvailable, setDraftAvailable] = useState(true);
  const [productOpen, setProductOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerTerm, setCustomerTerm] = useState("");
  const [customerPage, setCustomerPage] = useState(0);
  const [debounced, setDebounced] = useState(form);
  const locked = busy || pending !== null;
  useEffect(() => {
    setDraftAvailable(saveDraft(ownerId, "sale", { id, originalRecipeId, action, form, pending }));
  }, [ownerId, id, originalRecipeId, action, form, pending]);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(form), 350);
    return () => clearTimeout(t);
  }, [form]);
  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => {
      setCustomerTerm(customerSearch);
      setCustomerPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [customerSearch]);
  const products = useQuery({
    queryKey: ["recipes", ownerId, "sale-picker", term, page],
    queryFn: ({ signal }) => listRecipes(term, page, signal),
    enabled: productOpen,
    retry: false,
  });
  const customers = useQuery({
    queryKey: ["customers", ownerId, "picker", customerTerm, customerPage],
    queryFn: ({ signal }) => listCustomers(customerTerm, customerPage, signal),
    enabled: customerOpen,
    retry: false,
  });
  let payload: Record<string, unknown> | null = null;
  let validation = "";
  try {
    payload = salePayload(debounced, true);
  } catch (e) {
    validation = e instanceof Error ? e.message : "Confira os campos.";
  }
  const quote = useQuery({
    queryKey: ["sale-preview", ownerId, action === "update" ? id : null, payload],
    queryFn: ({ signal }) => quoteSale(action === "update" ? id : null, payload!, signal),
    enabled: online && payload !== null,
    retry: false,
  });
  const current = form === debounced && !quote.isFetching;
  function change<K extends keyof SaleForm>(key: K, value: SaleForm[K]) {
    setForm((old) => ({
      ...old,
      [key]: value,
      ...(key !== "confirmLoss" ? { confirmLoss: false } : {}),
    }));
    setError("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    if (!online) {
      setError("Conecte-se antes de salvar.");
      return;
    }
    let command: CommerceCommand;
    try {
      if (pending) command = pending;
      else {
        if (!current || !quote.data || quote.isError)
          throw new Error("Recalcule e confira os valores antes de salvar.");
        if (BigInt(quote.data.profit_cents) < 0n && !form.confirmLoss)
          throw new Error("Confirme o prejuízo antes de salvar.");
        command = {
          commandId: crypto.randomUUID(),
          entity: "sale",
          action,
          id,
          payload: { ...salePayload(form), quote_signature: quote.data.signature },
        };
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os campos.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(command);
    setDraftAvailable(
      saveDraft(ownerId, "sale", { id, originalRecipeId, action, form, pending: command }),
    );
    try {
      const result = await sendCommerceCommand(command);
      removeDraft(ownerId, "sale");
      onSaved(result.status === "gone");
    } catch (e) {
      if (e instanceof MaterialCommandError && e.definitive) {
        setPending(null);
        void quote.refetch();
      }
      setError(e instanceof Error ? e.message : "Não foi possível confirmar a venda.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent side="bottom" className="material-sheet">
        <div className="sheet-grabber" aria-hidden="true" />
        <SheetTitle>{action === "update" ? "Editar venda" : "Nova venda"}</SheetTitle>
        <SheetDescription>Registre o produto, o pagamento e quem comprou.</SheetDescription>
        <form onSubmit={submit} className="material-form" aria-busy={busy}>
          {!draftAvailable && (
            <p className="notice warning" role="alert">
              Não foi possível guardar o rascunho. Mantenha esta tela aberta até salvar.
            </p>
          )}
          {restored && (
            <p className="notice success">Rascunho recuperado. Confira os dados antes de salvar.</p>
          )}
          <fieldset disabled={locked} className="form-fields">
            <div className="field">
              <span>Produto da venda</span>
              <button
                type="button"
                className="secondary-button product-choice"
                onClick={() => setProductOpen(!productOpen)}
                aria-expanded={productOpen}
              >
                {quote.data?.product_name ??
                  (form.productName || item?.product_name) ??
                  (form.recipeId ? "Produto selecionado" : "Escolher receita")}
              </button>
            </div>
            {productOpen && (
              <div className="recipe-picker">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Buscar produto para vender"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar receita…"
                  />
                </label>
                {products.isPending ? (
                  <p>Carregando…</p>
                ) : products.isError ? (
                  <p role="alert">
                    {products.error.message}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void products.refetch()}
                    >
                      Tentar novamente
                    </button>
                  </p>
                ) : (
                  <>
                    {products.data.items.length === 0 && (
                      <p>Cadastre uma receita completa em Produtos → Receitas.</p>
                    )}
                    {products.data.items.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        disabled={!r.pricing.ready}
                        onClick={() => {
                          setForm((old) => ({
                            ...old,
                            recipeId: r.id,
                            productName: r.name,
                            price:
                              r.pricing.suggested_cents === null
                                ? ""
                                : `${BigInt(r.pricing.suggested_cents) / 100n},${(BigInt(r.pricing.suggested_cents) % 100n).toString().padStart(2, "0")}`,
                            confirmProduct: false,
                            confirmLoss: false,
                          }));
                          setProductOpen(false);
                          setError("");
                        }}
                      >
                        <span>
                          {r.name}
                          <small>
                            {r.pricing.ready
                              ? `Sugestão ${centsValue(r.pricing.suggested_cents)}`
                              : r.pricing.reason}
                          </small>
                        </span>
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
                        disabled={(page + 1) * pageSize >= products.data.total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {action === "update" && (
              <p className="helper-note">
                Quantidade, preço e pagamento usam os custos e as taxas históricos.{" "}
                {item?.recipe_id === null
                  ? "A receita original foi excluída; o histórico permanece disponível."
                  : ""}
              </p>
            )}
            {action === "update" && form.recipeId !== originalRecipeId && (
              <label className="check-field notice warning">
                <input
                  type="checkbox"
                  checked={form.confirmProduct}
                  onChange={(e) => change("confirmProduct", e.target.checked)}
                />
                Confirmo a troca do produto e o uso dos custos e taxas atuais.
              </label>
            )}
            <div className="field-grid">
              <label className="field">
                Quantidade vendida
                <input
                  required
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                />
              </label>
              <label className="field">
                Preço por unidade (R$)
                <input
                  required
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => change("price", e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Pagamento
              <select
                aria-label="Pagamento"
                value={form.payment}
                onChange={(e) => change("payment", e.target.value as SaleForm["payment"])}
              >
                {Object.entries(paymentLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Data e hora da venda
              <input
                aria-label="Data e hora da venda"
                type="datetime-local"
                required
                step="1"
                min="2000-01-01T00:00"
                max="2099-12-31T23:59:59"
                value={form.occurredLocal}
                onChange={(e) => change("occurredLocal", e.target.value)}
              />
              <small>Horário de São Paulo, inclusive em lançamentos retroativos.</small>
            </label>
            <div className="recipe-section-heading">
              <h3>Cliente</h3>
            </div>
            <div className="customer-modes">
              <label className="check-field">
                <input
                  type="radio"
                  name="customer-mode"
                  checked={form.anonymous}
                  onChange={() => change("anonymous", true)}
                />
                Sem identificação
              </label>
              <label className="check-field">
                <input
                  type="radio"
                  name="customer-mode"
                  checked={!form.anonymous}
                  onChange={() => change("anonymous", false)}
                />
                Identificar cliente
              </label>
            </div>
            {!form.anonymous && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCustomerOpen(!customerOpen)}
                >
                  Selecionar cliente existente
                </button>
                {customerOpen && (
                  <div className="recipe-picker">
                    <label className="search-field">
                      <Search size={18} />
                      <input
                        aria-label="Buscar cliente existente"
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="Nome ou telefone…"
                      />
                    </label>
                    {customers.isPending ? (
                      <p>Carregando…</p>
                    ) : customers.isError ? (
                      <p role="alert">
                        {customers.error.message}
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => void customers.refetch()}
                        >
                          Tentar novamente
                        </button>
                      </p>
                    ) : (
                      <>
                        {customers.data.items.length === 0 && (
                          <p>
                            Nenhum cliente encontrado. Preencha nome e telefone abaixo para
                            cadastrar.
                          </p>
                        )}
                        {customers.data.items.map((c) => (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              setForm((old) => ({
                                ...old,
                                customerId: c.id,
                                customerName: c.name,
                                customerPhone: c.phone,
                              }));
                              setCustomerOpen(false);
                            }}
                          >
                            <span>
                              {c.name}
                              <small>{c.phone}</small>
                            </span>
                          </button>
                        ))}
                        <div className="picker-pagination">
                          <button
                            type="button"
                            className="text-button"
                            disabled={customerPage === 0}
                            onClick={() => setCustomerPage((p) => p - 1)}
                          >
                            Anterior
                          </button>
                          <span>{customerPage + 1}</span>
                          <button
                            type="button"
                            className="text-button"
                            disabled={(customerPage + 1) * 20 >= customers.data.total}
                            onClick={() => setCustomerPage((p) => p + 1)}
                          >
                            Próxima
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <label className="field">
                  Nome do cliente
                  <input
                    required
                    maxLength={120}
                    value={form.customerName}
                    onChange={(e) => change("customerName", e.target.value)}
                  />
                </label>
                <label className="field">
                  Telefone do cliente
                  <input
                    aria-label="Telefone do cliente"
                    required
                    type="tel"
                    maxLength={40}
                    value={form.customerPhone}
                    onChange={(e) => {
                      setForm((old) => ({ ...old, customerPhone: e.target.value, customerId: "" }));
                      setError("");
                    }}
                    placeholder="(11) 99999-9999"
                  />
                  <small>
                    Brasil por padrão. Para outro país, use + e o código do país. O mesmo telefone
                    reúne as compras.
                  </small>
                </label>
              </>
            )}
          </fieldset>
          {!online ? (
            <p className="notice warning">
              Sem conexão.{" "}
              {draftAvailable
                ? "Rascunho preservado; nenhuma venda foi confirmada."
                : "Mantenha a tela aberta."}
            </p>
          ) : !current ? (
            <p role="status" className="cost-preview">
              Atualizando cálculo…
            </p>
          ) : validation ? (
            <p className="notice warning">{validation}</p>
          ) : quote.isError ? (
            <p className="notice danger" role="alert">
              {quote.error.message}
            </p>
          ) : quote.data ? (
            <>
              <SaleTotals quote={quote.data} />
              {BigInt(quote.data.profit_cents) < 0n && (
                <label className="check-field notice warning">
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={form.confirmLoss}
                    onChange={(e) => change("confirmLoss", e.target.checked)}
                  />
                  Confirmo esta venda com prejuízo de{" "}
                  {centsValue((-BigInt(quote.data.profit_cents)).toString())}.
                </label>
              )}
            </>
          ) : null}
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          {pending && !busy && (
            <p className="notice warning">
              Tentativa aguardando confirmação. Repita com os mesmos dados para evitar duplicação.
            </p>
          )}
          <div className="editor-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !online}
              onClick={() => void quote.refetch()}
            >
              Recalcular
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
              Fechar e guardar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !online || (!pending && (!current || !quote.data || quote.isError))}
            >
              {busy ? "Salvando…" : pending ? "Tentar novamente" : "Salvar venda"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
