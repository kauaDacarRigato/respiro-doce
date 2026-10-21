import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { readDraft, removeDraft, saveDraft } from "@/lib/drafts";
import {
  emptyMaterialForm,
  formFromMaterial,
  materialPayload,
  nutrientFields,
  priceInCents,
  decimalInput,
  unitCost,
  unitLabels,
  type Material,
  type MaterialForm,
  type MaterialUnit,
} from "./material-domain";
import { MaterialCommandError, sendMaterialCommand, type MaterialCommand } from "./material-data";

export type MaterialDraft = {
  form: MaterialForm;
  id: string;
  action: "create" | "update";
  pending: MaterialCommand | null;
};
export function getMaterialDraft(ownerId: string): MaterialDraft | null {
  const raw = readDraft(ownerId, "material");
  if (
    !raw ||
    typeof raw["id"] !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(raw["id"]) ||
    !["create", "update"].includes(String(raw["action"]))
  )
    return null;
  const form = raw["form"] as MaterialForm | undefined;
  if (
    !form ||
    typeof form !== "object" ||
    !form.nutrients ||
    !Object.keys(emptyMaterialForm()).every((k) => k in form) ||
    !Object.entries(form).every(([key, value]) =>
      key === "nutrients" ? typeof value === "object" : typeof value === "string",
    ) ||
    !nutrientFields.every(([key]) => typeof form.nutrients[key] === "string")
  )
    return null;
  const pending = raw["pending"] as MaterialCommand | null;
  if (
    pending &&
    (typeof pending !== "object" ||
      typeof pending.commandId !== "string" ||
      pending.id !== raw["id"] ||
      pending.action !== raw["action"] ||
      !pending.payload)
  )
    return null;
  return { form, id: raw["id"], action: raw["action"] as "create" | "update", pending };
}

const costFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
export function MaterialEditor({
  ownerId,
  item,
  restored,
  online,
  onClose,
  onSaved,
}: {
  ownerId: string;
  item?: Material;
  restored?: MaterialDraft;
  online: boolean;
  onClose: () => void;
  onSaved: (gone: boolean) => void;
}) {
  const [form, setForm] = useState<MaterialForm>(
    () => restored?.form ?? (item ? formFromMaterial(item) : emptyMaterialForm()),
  );
  const [id] = useState(() => restored?.id ?? item?.id ?? crypto.randomUUID());
  const action = restored?.action ?? (item ? "update" : "create");
  const [pending, setPending] = useState<MaterialCommand | null>(restored?.pending ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(true);
  const lock = useRef(false);
  const locked = busy || pending !== null;
  useEffect(() => {
    setDraftAvailable(saveDraft(ownerId, "material", { form, id, action, pending }));
  }, [ownerId, form, id, action, pending]);
  const change = <K extends keyof MaterialForm>(key: K, value: MaterialForm[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setError("");
  };
  let preview = "Informe o preço e a quantidade para calcular o custo.";
  try {
    const quantity = Number(decimalInput(form.quantity));
    if (quantity > 0) {
      const cost = unitCost({
        package_price_cents: priceInCents(form.price),
        package_quantity: quantity,
        unit: form.unit,
      });
      preview = `${costFormat.format(cost.value)} por ${cost.unit}`;
    }
  } catch {
    /* Prévia disponível ao preencher campos válidos. */
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (!online) {
      setError("Você está sem conexão. Conecte-se antes de salvar.");
      return;
    }
    let command: MaterialCommand;
    try {
      command = pending ?? {
        commandId: crypto.randomUUID(),
        action,
        id,
        payload: materialPayload(form),
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os campos informados.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setPending(command);
    // Gravar antes da rede para preservar a chave mesmo se a aba fechar no envio.
    setDraftAvailable(saveDraft(ownerId, "material", { form, id, action, pending: command }));
    try {
      const result = await sendMaterialCommand(command);
      removeDraft(ownerId, "material");
      onSaved(result.status === "gone");
    } catch (e) {
      if (e instanceof MaterialCommandError && e.definitive) setPending(null);
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível confirmar o salvamento. Tente novamente.",
      );
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
        <SheetTitle>
          {action === "update" ? "Editar cadastro" : "Novo insumo ou embalagem"}
        </SheetTitle>
        <SheetDescription>Preencha os dados da embalagem que você compra.</SheetDescription>
        <form onSubmit={submit} aria-busy={busy} className="material-form">
          {!draftAvailable && (
            <p className="notice warning" role="alert">
              Este navegador não conseguiu guardar o rascunho. Não feche a tela antes de salvar.
            </p>
          )}
          {restored && (
            <p className="notice success">Rascunho recuperado. Confira os dados antes de salvar.</p>
          )}
          <fieldset disabled={locked} className="form-fields">
            <label className="field">
              Nome
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(e) => change("name", e.target.value)}
                placeholder="Ex.: Leite condensado"
                autoComplete="off"
              />
            </label>
            <div className="field-grid">
              <label className="field">
                Tipo
                <select
                  aria-label="Tipo"
                  value={form.kind}
                  onChange={(e) => {
                    const kind = e.target.value as MaterialForm["kind"];
                    setForm((old) => ({
                      ...old,
                      kind,
                      unit: kind === "packaging" ? "un" : old.unit,
                    }));
                  }}
                >
                  <option value="ingredient">Insumo</option>
                  <option value="packaging">Embalagem</option>
                </select>
              </label>
              <label className="field">
                Unidade
                <select
                  aria-label="Unidade"
                  value={form.unit}
                  onChange={(e) => change("unit", e.target.value as MaterialUnit)}
                >
                  {Object.entries(unitLabels)
                    .filter(([key]) => form.kind !== "packaging" || key === "un")
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="field-grid">
              <label className="field">
                {form.kind === "packaging" ? "Unidades no pacote" : "Quantidade da embalagem"}
                <input
                  inputMode="decimal"
                  required
                  value={form.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                  placeholder={form.kind === "packaging" ? "Ex.: 100" : "Ex.: 395"}
                />
              </label>
              <label className="field">
                Preço pago (R$)
                <input
                  inputMode="decimal"
                  required
                  value={form.price}
                  onChange={(e) => change("price", e.target.value)}
                  placeholder="Ex.: 6,50"
                />
              </label>
            </div>
            <div className="cost-preview">
              <span>Custo de referência</span>
              <strong>{preview}</strong>
            </div>
            {form.kind === "packaging" ? (
              <p className="helper-note">
                <Info size={17} /> A embalagem entra no custo, mas não no peso alimentício nem nos
                nutrientes.
              </p>
            ) : (
              <>
                {form.unit === "un" && (
                  <label className="field">
                    Peso alimentício de uma unidade (g) — opcional
                    <input
                      inputMode="decimal"
                      value={form.pieceWeight}
                      onChange={(e) => change("pieceWeight", e.target.value)}
                      placeholder="Ex.: 50 para um ovo sem casca"
                    />
                    <small>Use o peso comestível, sem casca ou embalagem.</small>
                  </label>
                )}
                {["ml", "l"].includes(form.unit) && (
                  <label className="field">
                    Peso de 1 mL (g) — opcional
                    <input
                      inputMode="decimal"
                      value={form.density}
                      onChange={(e) => change("density", e.target.value)}
                      placeholder="Informe apenas se souber"
                    />
                    <small>
                      Permite converter volume em peso. Não presumimos que 1 mL seja 1 g.
                    </small>
                  </label>
                )}
                <button
                  type="button"
                  className="nutrition-toggle"
                  onClick={() => setNutritionOpen(!nutritionOpen)}
                  aria-expanded={nutritionOpen}
                >
                  Dados nutricionais{" "}
                  <span>
                    Opcional <ChevronDown size={17} />
                  </span>
                </button>
                {nutritionOpen && (
                  <div className="nutrition-fields">
                    <p className="notice warning">
                      Copie os valores do rótulo por 100 g ou 100 mL. Campo vazio é informação
                      ausente; preencha 0 somente quando confirmado.
                    </p>
                    <label className="field">
                      Base dos valores
                      <select
                        aria-label="Base dos valores"
                        value={form.nutritionBase}
                        onChange={(e) => change("nutritionBase", e.target.value as "g" | "ml")}
                      >
                        <option value="g">Por 100 g</option>
                        <option value="ml">Por 100 mL</option>
                      </select>
                    </label>
                    <div className="field-grid">
                      {nutrientFields.map(([key, label, unit]) => (
                        <label
                          className={`field ${form.nutrients[key].trim() ? "" : "missing-nutrient"}`}
                          key={key}
                        >
                          {label} ({unit})
                          <input
                            inputMode="decimal"
                            value={form.nutrients[key]}
                            onChange={(e) =>
                              change("nutrients", { ...form.nutrients, [key]: e.target.value })
                            }
                            placeholder="Não informado"
                          />
                        </label>
                      ))}
                    </div>
                    <label className="field">
                      Referência do rótulo
                      <input
                        maxLength={500}
                        value={form.nutritionSource}
                        onChange={(e) => change("nutritionSource", e.target.value)}
                        placeholder="Qual rótulo você consultou?"
                      />
                      <small>
                        O cadastro continua sem marca; a referência ajuda a revisar a composição.
                      </small>
                    </label>
                  </div>
                )}
              </>
            )}
            {item?.kind === "ingredient" && form.kind === "packaging" && (
              <p className="notice warning">
                Ao salvar como embalagem, os dados nutricionais deste cadastro serão removidos.
              </p>
            )}
          </fieldset>
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
          {!online && (
            <p className="notice warning" role="status">
              {draftAvailable
                ? "Sem conexão. O rascunho está preservado."
                : "Sem conexão. Mantenha esta tela aberta para preservar a digitação."}
            </p>
          )}
          <div className="editor-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
              Fechar e guardar
            </button>
            <button type="submit" className="primary-button" disabled={busy || !online}>
              {busy ? "Salvando…" : pending ? "Tentar novamente" : "Salvar cadastro"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
