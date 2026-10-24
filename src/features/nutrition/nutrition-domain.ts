import { nutrientFields, type NutrientKey } from "@/features/products/material-domain";
export type NutritionKey = NutrientKey | "energy_kj";
export const nutritionRows = [
  nutrientFields[0],
  ["energy_kj", "Energia em kJ (auxiliar)", "kJ"],
  ...nutrientFields.slice(1),
] as readonly (readonly [NutritionKey, string, string])[];
export type NutritionReport = {
  ready: boolean;
  issues: string[];
  kind: "estimate-not-label";
  calculated_at: string;
  reference: string;
  recipe: {
    id: string;
    name: string;
    final_quantity: string | null;
    final_unit: string;
    serving_quantity: string | null;
    serving_unit: string;
    household_measure: string;
  };
  rows: { key: NutritionKey; total: string; per100: string; portion: string; vd: string | null }[];
  ingredients: {
    id: string;
    name: string;
    quantity: string;
    unit: string;
    used_base: string | null;
    base_unit: string | null;
    source: string | null;
    contributions: Record<NutrientKey, string | null>;
  }[];
};
// Presentation rounding only. SQL calculates totals/ratios before any rounding.
export function nutritionNumber(value: string | null, places = 2) {
  if (value === null) return "—";
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Valor nutricional inválido.");
  const [whole, fraction = ""] = value.split(".");
  const padded = fraction.padEnd(places + 1, "0");
  let scaled = BigInt(whole!) * 10n ** BigInt(places) + BigInt(padded.slice(0, places) || "0");
  if (padded[places]! >= "5") scaled += 1n;
  return `${(scaled / 10n ** BigInt(places)).toLocaleString("pt-BR")}${places ? `,${String(scaled % 10n ** BigInt(places)).padStart(places, "0")}` : ""}`;
}

export function nutritionSignature(report: NutritionReport | undefined) {
  if (!report) return "";
  return JSON.stringify({
    ready: report.ready,
    issues: report.issues,
    recipe: report.recipe,
    rows: report.rows,
    ingredients: report.ingredients,
  });
}
