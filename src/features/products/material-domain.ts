export const unitLabels = { g: "g", kg: "kg", ml: "mL", l: "L", un: "unidade" } as const;
export type MaterialUnit = keyof typeof unitLabels;
export type MaterialKind = "ingredient" | "packaging";
export const nutrientFields = [
  ["energy_kcal", "Valor energético", "kcal"],
  ["carbohydrates_g", "Carboidratos", "g"],
  ["total_sugars_g", "Açúcares totais", "g"],
  ["added_sugars_g", "Açúcares adicionados", "g"],
  ["proteins_g", "Proteínas", "g"],
  ["total_fat_g", "Gorduras totais", "g"],
  ["saturated_fat_g", "Gorduras saturadas", "g"],
  ["trans_fat_g", "Gorduras trans", "g"],
  ["fiber_g", "Fibra alimentar", "g"],
  ["sodium_mg", "Sódio", "mg"],
] as const;
export type NutrientKey = (typeof nutrientFields)[number][0];
export type Nutrition = { base_unit: "g" | "ml"; source: string } & Record<
  NutrientKey,
  number | null
>;
export type Material = {
  id: string;
  name: string;
  kind: MaterialKind;
  unit: MaterialUnit;
  package_quantity: number;
  package_price_cents: number;
  piece_weight_g: number | null;
  density_g_ml: number | null;
  updated_at: string;
  nutrition: Nutrition | null;
};
export type MaterialForm = {
  name: string;
  kind: MaterialKind;
  unit: MaterialUnit;
  quantity: string;
  price: string;
  pieceWeight: string;
  density: string;
  nutritionBase: "g" | "ml";
  nutritionSource: string;
  nutrients: Record<NutrientKey, string>;
};

export function emptyMaterialForm(): MaterialForm {
  return {
    name: "",
    kind: "ingredient",
    unit: "g",
    quantity: "",
    price: "",
    pieceWeight: "",
    density: "",
    nutritionBase: "g",
    nutritionSource: "",
    nutrients: Object.fromEntries(nutrientFields.map(([key]) => [key, ""])) as Record<
      NutrientKey,
      string
    >,
  };
}
export function formFromMaterial(item: Material): MaterialForm {
  return {
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    quantity: String(item.package_quantity).replace(".", ","),
    price: (item.package_price_cents / 100).toFixed(2).replace(".", ","),
    pieceWeight: item.piece_weight_g == null ? "" : String(item.piece_weight_g).replace(".", ","),
    density: item.density_g_ml == null ? "" : String(item.density_g_ml).replace(".", ","),
    nutritionBase:
      item.nutrition?.base_unit ?? (item.unit === "ml" || item.unit === "l" ? "ml" : "g"),
    nutritionSource: item.nutrition?.source ?? "",
    nutrients: Object.fromEntries(
      nutrientFields.map(([key]) => [
        key,
        item.nutrition?.[key] == null ? "" : String(item.nutrition[key]).replace(".", ","),
      ]),
    ) as Record<NutrientKey, string>,
  };
}

// Interpretação explícita de vírgula decimal e centavos, sem multiplicar floats.
export function decimalInput(value: string, precision = 6): string {
  let text = value.trim();
  if (text.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text))
      throw new Error("Use um número válido, como 12,50.");
    text = text.replaceAll(".", "").replace(",", ".");
  }
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(text))
    throw new Error(`Use um número positivo com até ${precision} casas decimais.`);
  return text;
}
export function priceInCents(value: string): number {
  const [whole = "0", fraction = ""] = decimalInput(value, 2).split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > 100000000000n) throw new Error("O preço informado é muito alto.");
  return Number(cents);
}
function positive(value: string, max: number): string {
  const result = decimalInput(value);
  if (Number(result) <= 0 || Number(result) > max)
    throw new Error("Informe uma quantidade maior que zero e dentro do limite permitido.");
  return result;
}
export function materialPayload(form: MaterialForm) {
  const name = form.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new Error("Informe um nome com até 120 caracteres.");
  if (!["ingredient", "packaging"].includes(form.kind) || !(form.unit in unitLabels))
    throw new Error("Selecione um tipo e uma unidade válidos.");
  const quantity = positive(form.quantity, 1000000000);
  if (form.kind === "packaging" && (form.unit !== "un" || !Number.isInteger(Number(quantity))))
    throw new Error("Embalagens devem ter uma quantidade inteira de unidades.");
  const nutrition =
    form.kind === "ingredient"
      ? {
          base_unit: form.nutritionBase,
          source: form.nutritionSource.trim(),
          ...(Object.fromEntries(
            nutrientFields.map(([key, label]) => {
              if (!form.nutrients[key].trim()) return [key, null];
              const value = decimalInput(form.nutrients[key]);
              if (Number(value) > 1000000)
                throw new Error(`Confira o valor de ${label.toLowerCase()}.`);
              return [key, value];
            }),
          ) as Record<NutrientKey, string | null>),
        }
      : null;
  if (nutrition && nutrition.source.length > 500)
    throw new Error("A referência do rótulo deve ter até 500 caracteres.");
  return {
    name,
    kind: form.kind,
    unit: form.unit,
    package_quantity: quantity,
    package_price_cents: priceInCents(form.price),
    piece_weight_g:
      form.kind === "ingredient" && form.unit === "un" && form.pieceWeight.trim()
        ? positive(form.pieceWeight, 1000000)
        : null,
    density_g_ml:
      form.kind === "ingredient" && ["ml", "l"].includes(form.unit) && form.density.trim()
        ? positive(form.density, 1000)
        : null,
    nutrition,
  };
}
export function missingNutrition(item: Material) {
  return (
    item.kind === "ingredient" && nutrientFields.some(([key]) => item.nutrition?.[key] == null)
  );
}
export function unitCost(
  item: Pick<Material, "package_price_cents" | "package_quantity" | "unit">,
) {
  const scale = item.unit === "kg" || item.unit === "l" ? 1000 : 1;
  const unit = item.unit === "kg" ? "g" : item.unit === "l" ? "mL" : unitLabels[item.unit];
  return { value: item.package_price_cents / 100 / (item.package_quantity * scale), unit };
}
export function materialError(error: { code?: string | undefined; message?: string | undefined }) {
  if (error.code === "23505")
    return "Já existe um cadastro com esse nome. Use outro nome ou edite o existente.";
  if (error.code === "23503")
    return error.message?.startsWith("Usado em:")
      ? error.message
      : "Este insumo está em uso. Ajuste as receitas relacionadas antes de excluir ou alterar a unidade.";
  if (error.code === "P0002") return "Este cadastro não está mais disponível. Atualize a lista.";
  if (error.code === "42501" || error.code === "PGRST301")
    return "Seu acesso expirou. Entre novamente; seu rascunho está preservado.";
  if (error.code?.startsWith("22") || error.code === "23514" || error.code === "23502")
    return "Confira o nome, as quantidades, o preço e as unidades informadas.";
  return "Não foi possível confirmar o salvamento. Confira sua conexão e tente novamente com os mesmos dados.";
}
