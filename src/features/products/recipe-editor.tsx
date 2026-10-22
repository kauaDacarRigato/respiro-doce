import { ConcurrentEditNotice } from "@/features/sync/concurrent-edit-notice";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { readDraft, removeDraft, saveDraft } from "@/lib/drafts";
import {
  MaterialCommandError,
  listMaterials,
  pageSize,
  type MaterialCommand,
} from "./material-data";
import { unitLabels, type Material, type MaterialUnit } from "./material-domain";
import {
  compatibleUnits,
  emptyRecipeForm,
  formFromRecipe,
  recipeFormSchema,
  recipePayload,
  type Recipe,
  type RecipeForm,
} from "./recipe-domain";
import { previewRecipe, selectedMaterials, sendRecipeCommand } from "./recipe-data";
import { RecipePricingView } from "./recipe-pricing";
export type RecipeDraft = {
  form: RecipeForm;
  id: string;
  action: "create" | "update";
  pending: MaterialCommand | null;
};
export function getRecipeDraft(owner: string): RecipeDraft | null {
  const value = readDraft(owner, "recipe");
  if (
    !value ||
    !recipeFormSchema.safeParse(value["form"]).success ||
    typeof value["id"] !== "string" ||
    !["create", "update"].includes(String(value["action"]))
  )
    return null;
  return value as RecipeDraft;
}
export function RecipeEditor({
  ownerId,
  item,
  restored,
  online,
  onClose,
  onSaved,
}: {
  ownerId: string;
  item?: Recipe;
  restored?: RecipeDraft;
  online: boolean;
  onClose: () => void;
  onSaved: (gone: boolean) => void;
}) {
  const [form, setForm] = useState(
    () => restored?.form ?? (item ? formFromRecipe(item) : emptyRecipeForm()),
  );
  const [id] = useState(() => restored?.id ?? item?.id ?? crypto.randomUUID());
  const action = restored?.action ?? (item ? "update" : "create");
  const [pending, setPending] = useState<MaterialCommand | null>(restored?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [draftAvailable, setDraftAvailable] = useState(true);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [debounced, setDebounced] = useState(form);
  const locked = busy || pending !== null;
  useEffect(() => {
    setDraftAvailable(saveDraft(ownerId, "recipe", { form, id, action, pending }));
  }, [ownerId, form, id, action, pending]);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(form), 350);
    return () => clearTimeout(timer);
  }, [form]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const ids = form.components.map((c) => c.material_id).sort();
  const selected = useQuery({
    queryKey: ["materials", ownerId, "selected", ids],
    queryFn: ({ signal }) => selectedMaterials(ids, signal),
    retry: false,
  });
  const options = useQuery({
    queryKey: ["materials", ownerId, "picker", term, page],
    queryFn: ({ signal }) => listMaterials(term, "all", page, signal),
    enabled: pickerOpen,
    retry: false,
  });
  let payload: Record<string, unknown> | null = null;
  let previewError = "";
  try {
    payload = recipePayload(debounced, true);
  } catch (e) {
    previewError = e instanceof Error ? e.message : "Confira os campos.";
  }
  const preview = useQuery({
    queryKey: ["recipe-preview", ownerId, payload],
    queryFn: ({ signal }) => previewRecipe(payload!, signal),
    enabled: online && payload !== null,
    retry: false,
  });
  const change = <K extends keyof RecipeForm>(key: K, value: RecipeForm[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setError("");
  };
  function add(material: Material) {
    change("components", [
      ...form.components,
      {
        material_id: material.id,
        quantity: "1",
        unit: material.unit === "kg" ? "g" : material.unit === "l" ? "ml" : material.unit,
      },
    ]);
    setPickerOpen(false);
    setSearch("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!online) {
      setError("Conecte-se à internet antes de salvar.");
      return;
    }
    let command: MaterialCommand;
    try {
      command = pending ?? {
        commandId: crypto.randomUUID(),
        id,
        action,
        payload: recipePayload(form),
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os campos.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setPending(command);
    setError("");
    setDraftAvailable(saveDraft(ownerId, "recipe", { form, id, action, pending: command }));
    try {
      const result = await sendRecipeCommand(command);
      removeDraft(ownerId, "recipe");
      onSaved(result.status === "gone");
    } catch (e) {
      if (e instanceof MaterialCommandError && e.definitive) setPending(null);
      setError(e instanceof Error ? e.message : "Não foi possível confirmar o salvamento.");
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
      <SheetContent side="bottom" className="material-sheet recipe-sheet">
        <div className="sheet-grabber" aria-hidden="true" />
        <SheetTitle>{action === "update" ? "Editar receita" : "Nova receita"}</SheetTitle>
        <SheetDescription>
          Monte o lote completo para descobrir o custo de cada unidade.
        </SheetDescription>
        <form onSubmit={submit} className="material-form" aria-busy={busy}>
          <ConcurrentEditNotice editing={action === "update"} />
          {!draftAvailable && (
            <p className="notice warning" role="alert">
              Não foi possível guardar o rascunho neste navegador. Mantenha esta tela aberta até
              salvar.
            </p>
          )}
          {restored && (
            <p className="notice success">
              Rascunho recuperado. Confira a composição e os preços atuais.
            </p>
          )}
          <fieldset disabled={locked} className="form-fields">
            <label className="field">
              Nome da receita
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
                placeholder="Ex.: Brigadeiro tradicional"
              />
            </label>
            <div className="recipe-section-heading">
              <h3>Ingredientes e embalagens</h3>
              <span>Por lote</span>
            </div>
            {selected.isError && (
              <p className="notice danger" role="alert">
                {selected.error.message}{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void selected.refetch()}
                >
                  Atualizar
                </button>
              </p>
            )}
            {form.components.length === 0 && (
              <p className="helper-note">
                Adicione tudo que você usa para produzir e embalar um lote.
              </p>
            )}
            <div className="recipe-components">
              {form.components.map((component, index) => {
                const material = selected.data?.find((m) => m.id === component.material_id);
                const name =
                  material?.name ??
                  (selected.isPending ? "Carregando insumo…" : "Insumo indisponível");
                const units = material ? compatibleUnits(material) : [component.unit];
                return (
                  <div className="recipe-component" key={component.material_id}>
                    <div className="component-name">
                      <strong>{name}</strong>
                      <button
                        type="button"
                        className="icon-button danger-text"
                        aria-label={`Remover ${name}`}
                        onClick={() =>
                          change(
                            "components",
                            form.components.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="field-grid">
                      <label className="field">
                        Quantidade usada
                        <input
                          aria-label={`Quantidade de ${name}`}
                          inputMode="decimal"
                          required
                          value={component.quantity}
                          onChange={(e) =>
                            change(
                              "components",
                              form.components.map((c, i) =>
                                i === index ? { ...c, quantity: e.target.value } : c,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        Unidade
                        <select
                          aria-label={`Unidade de ${name}`}
                          value={component.unit}
                          onChange={(e) =>
                            change(
                              "components",
                              form.components.map((c, i) =>
                                i === index ? { ...c, unit: e.target.value as MaterialUnit } : c,
                              ),
                            )
                          }
                        >
                          {units.map((unit) => (
                            <option key={unit} value={unit}>
                              {unitLabels[unit]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={form.components.length >= 200}
              onClick={() => setPickerOpen(!pickerOpen)}
              aria-expanded={pickerOpen}
            >
              <Plus size={18} /> Adicionar insumo ou embalagem
            </button>
            {pickerOpen && (
              <div className="recipe-picker">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    aria-label="Buscar insumo para adicionar"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar no seu catálogo…"
                  />
                </label>
                {options.isPending ? (
                  <p role="status">Carregando…</p>
                ) : options.isError ? (
                  <p role="alert">
                    {options.error.message}{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void options.refetch()}
                    >
                      Tentar novamente
                    </button>
                  </p>
                ) : (
                  <>
                    {options.data.items.length === 0 && (
                      <p>Nenhum insumo encontrado. Cadastre-o em Insumos e embalagens.</p>
                    )}
                    {options.data.items.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        disabled={ids.includes(m.id)}
                        onClick={() => add(m)}
                      >
                        <span>
                          {m.name}
                          <small>
                            {m.kind === "packaging" ? "Embalagem" : "Ingrediente"} · compra em{" "}
                            {unitLabels[m.unit]}
                          </small>
                        </span>
                        <Plus size={18} />
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
                        disabled={(page + 1) * pageSize >= options.data.total}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Próxima
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="recipe-section-heading">
              <h3>Rendimento e precificação</h3>
            </div>
            <label className="field">
              Rendimento do lote (unidades)
              <input
                aria-label="Rendimento do lote (unidades)"
                inputMode="numeric"
                value={form.yieldUnits}
                onChange={(e) => change("yieldUnits", e.target.value)}
                placeholder="Ex.: 20 brigadeiros"
              />
              <small>Inteiro positivo. Deixe vazio para salvar uma receita incompleta.</small>
            </label>
            <div className="field-grid">
              <label className="field">
                Custos indiretos (%)
                <input
                  required
                  inputMode="decimal"
                  value={form.indirect}
                  onChange={(e) => change("indirect", e.target.value)}
                />
              </label>
              <label className="field">
                Taxa para sugestão (%)
                <input
                  required
                  inputMode="decimal"
                  value={form.fee}
                  onChange={(e) => change("fee", e.target.value)}
                />
              </label>
            </div>
            <p className="helper-note">
              Os indiretos incidem sobre o custo dos ingredientes e das embalagens. O multiplicador
              do preço é fixo em 3.
            </p>
            <div className="recipe-section-heading">
              <h3>Após o preparo</h3>
            </div>
            <div className="field-grid">
              <label className="field">
                Quantidade final do lote
                <input
                  inputMode="decimal"
                  value={form.finalQuantity}
                  onChange={(e) => change("finalQuantity", e.target.value)}
                  placeholder="Ex.: 800"
                />
              </label>
              <label className="field">
                Unidade final
                <select
                  aria-label="Unidade final"
                  value={form.finalUnit}
                  onChange={(e) => change("finalUnit", e.target.value as "g" | "ml")}
                >
                  <option value="g">g</option>
                  <option value="ml">mL</option>
                </select>
              </label>
            </div>
            <p className="helper-note">
              Pese ou meça o alimento pronto, sem embalagens. Não substituímos esse valor pela soma
              dos ingredientes.
            </p>
            <details className="calculation-details">
              <summary>Porção para a futura tabela nutricional (opcional)</summary>
              <div className="field-grid">
                <label className="field">
                  Quantidade da porção
                  <input
                    inputMode="decimal"
                    value={form.servingQuantity}
                    onChange={(e) => change("servingQuantity", e.target.value)}
                  />
                </label>
                <label className="field">
                  Unidade da porção
                  <select
                    aria-label="Unidade da porção"
                    value={form.servingUnit}
                    onChange={(e) => change("servingUnit", e.target.value as "g" | "ml")}
                  >
                    <option value="g">g</option>
                    <option value="ml">mL</option>
                  </select>
                </label>
              </div>
              <label className="field">
                Medida caseira
                <input
                  maxLength={120}
                  value={form.householdMeasure}
                  onChange={(e) => change("householdMeasure", e.target.value)}
                  placeholder="Ex.: 1 unidade"
                />
              </label>
              <p>A tabela nutricional será liberada em uma etapa posterior.</p>
            </details>
          </fieldset>
          {!online ? (
            <p className="notice warning" role="status">
              Sem conexão. O cálculo depende dos preços atuais.{" "}
              {draftAvailable ? "Rascunho preservado." : "Mantenha esta tela aberta."}
            </p>
          ) : form !== debounced || preview.isFetching ? (
            <p className="cost-preview" role="status">
              Atualizando cálculo…
            </p>
          ) : previewError ? (
            <p className="notice warning">{previewError}</p>
          ) : preview.isError ? (
            <p className="notice danger" role="alert">
              {preview.error.message}{" "}
              <button type="button" className="text-button" onClick={() => void preview.refetch()}>
                Recalcular
              </button>
            </p>
          ) : preview.data ? (
            <RecipePricingView pricing={preview.data} fee={form.fee} />
          ) : null}
          {error && (
            <p className="notice danger" role="alert">
              {error}
            </p>
          )}
          {pending && !busy && (
            <p className="notice warning">
              Há uma tentativa aguardando confirmação. Tente novamente com os mesmos dados para
              evitar duplicação.
            </p>
          )}
          <div className="editor-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
              Fechar e guardar
            </button>
            <button type="submit" className="primary-button" disabled={busy || !online}>
              {busy ? "Salvando…" : pending ? "Tentar novamente" : "Salvar receita"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
