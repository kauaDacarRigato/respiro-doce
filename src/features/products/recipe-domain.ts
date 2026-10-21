import { z } from "zod";
import { decimalInput, type Material, type MaterialUnit } from "./material-domain";
export const componentSchema = z.object({
  material_id: z.string().uuid(),
  quantity: z.string(),
  unit: z.enum(["g", "kg", "ml", "l", "un"]),
});
export const recipeFormSchema = z.object({
  name: z.string(),
  yieldUnits: z.string(),
  indirect: z.string(),
  fee: z.string(),
  finalQuantity: z.string(),
  finalUnit: z.enum(["g", "ml"]),
  servingQuantity: z.string(),
  servingUnit: z.enum(["g", "ml"]),
  householdMeasure: z.string(),
  components: z.array(componentSchema).max(200),
});
export type RecipeForm = z.infer<typeof recipeFormSchema>;
export type RecipePricing = {
  ingredients: string;
  packaging: string;
  direct: string;
  indirect: string;
  lot: string;
  unit_cost: string | null;
  suggested_cents: string | null;
  fee_cents: string | null;
  total_unit_cents: string | null;
  profit_cents: string | null;
  raw_edible_g: string | null;
  ready: boolean;
  reason: string | null;
  components: {
    material_id: string;
    name: string;
    kind: string;
    quantity: string;
    unit: MaterialUnit;
    cost: string;
  }[];
};
export type Recipe = {
  id: string;
  name: string;
  yield_units: number | null;
  indirect_percent: number;
  fee_percent: number;
  final_quantity: number | null;
  final_unit: "g" | "ml";
  serving_quantity: number | null;
  serving_unit: "g" | "ml";
  household_measure: string;
  components: RecipeForm["components"];
  pricing: RecipePricing;
};
export const emptyRecipeForm = (): RecipeForm => ({
  name: "",
  yieldUnits: "",
  indirect: "25",
  fee: "0",
  finalQuantity: "",
  finalUnit: "g",
  servingQuantity: "",
  servingUnit: "g",
  householdMeasure: "",
  components: [],
});
export function formFromRecipe(item: Recipe): RecipeForm {
  return {
    name: item.name,
    yieldUnits: item.yield_units == null ? "" : String(item.yield_units),
    indirect: String(item.indirect_percent),
    fee: String(item.fee_percent),
    finalQuantity: item.final_quantity == null ? "" : String(item.final_quantity),
    finalUnit: item.final_unit,
    servingQuantity: item.serving_quantity == null ? "" : String(item.serving_quantity),
    servingUnit: item.serving_unit,
    householdMeasure: item.household_measure,
    components: item.components,
  };
}
function quantity(value: string, max = 1000000000) {
  const number = decimalInput(value);
  if (Number(number) <= 0 || Number(number) > max)
    throw new Error(
      "As quantidades devem ser maiores que zero e estar dentro do limite permitido.",
    );
  return number;
}
export function recipePayload(form: RecipeForm, preview = false) {
  const parsed = recipeFormSchema.safeParse(form);
  if (!parsed.success) throw new Error("Confira os campos e os insumos da receita.");
  const name = form.name.trim().replace(/\s+/g, " ");
  if ((!name && !preview) || name.length > 120)
    throw new Error("Informe um nome com até 120 caracteres.");
  const indirect = decimalInput(form.indirect, 3);
  const fee = decimalInput(form.fee, 3);
  if (Number(indirect) > 1000 || Number(fee) >= 100)
    throw new Error("Indiretos: de 0 a 1.000%. Taxa: de 0 a menos de 100%.");
  const yieldUnits = form.yieldUnits.trim() ? quantity(form.yieldUnits, 1000000) : null;
  if (yieldUnits && !Number.isInteger(Number(yieldUnits)))
    throw new Error("O rendimento deve ser um número inteiro de unidades.");
  if (form.householdMeasure.length > 120)
    throw new Error("A medida caseira deve ter até 120 caracteres.");
  const ids = new Set(form.components.map((c) => c.material_id));
  if (ids.size !== form.components.length) throw new Error("Adicione cada insumo uma única vez.");
  return {
    name,
    yield_units: yieldUnits,
    indirect_percent: indirect,
    fee_percent: fee,
    final_quantity: form.finalQuantity.trim() ? quantity(form.finalQuantity) : null,
    final_unit: form.finalUnit,
    serving_quantity: form.servingQuantity.trim() ? quantity(form.servingQuantity) : null,
    serving_unit: form.servingUnit,
    household_measure: form.householdMeasure.trim(),
    components: form.components.map((c) => ({ ...c, quantity: quantity(c.quantity) })),
  };
}
export function compatibleUnits(material: Material): MaterialUnit[] {
  if (material.kind === "packaging") return ["un"];
  if (material.unit === "g" || material.unit === "kg") return ["g", "kg"];
  if (material.unit === "ml" || material.unit === "l")
    return material.density_g_ml ? ["ml", "l", "g", "kg"] : ["ml", "l"];
  return material.piece_weight_g ? ["un", "g", "kg"] : ["un"];
}
const moneyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const moneyValue = (value: string) => moneyFormat.format(Number(value));
// Centavos finais chegam como texto; BigInt preserva valores acima do limite seguro de Number.
export function centsValue(value: string | null) {
  if (value === null) return "—";
  const cents = BigInt(value);
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "−" : ""}R$ ${(abs / 100n).toLocaleString("pt-BR")},${(abs % 100n).toString().padStart(2, "0")}`;
}
export function recipeError(error: { code?: string; message?: string }) {
  if (error.code === "23505")
    return "Já existe uma receita com esse nome. Edite a existente ou escolha outro nome.";
  if (error.code === "P0002")
    return "A receita ou um dos insumos não está mais disponível. Atualize a lista e confira a composição.";
  if (error.code === "42501" || error.code === "PGRST301")
    return "Seu acesso expirou. Entre novamente; seu rascunho está preservado.";
  if (error.code?.startsWith("22") || error.code?.startsWith("23"))
    return "Confira as quantidades, unidades e percentuais. As embalagens exigem unidades inteiras.";
  return "Não foi possível confirmar a operação. Confira a conexão e tente novamente com os mesmos dados.";
}
