import { describe, expect, it } from "vitest";
import {
  centsValue,
  compatibleUnits,
  emptyRecipeForm,
  recipePayload,
} from "@/features/products/recipe-domain";
import { type Material } from "@/features/products/material-domain";
describe("Contrato de entrada das receitas", () => {
  const valid = () => ({
    ...emptyRecipeForm(),
    name: "  TESTE   Brigadeiro  ",
    yieldUnits: "20",
    fee: "5,49",
    finalQuantity: "800,5",
  });
  it("normaliza decimais sem arredondar quantidades e permite receita incompleta", () => {
    expect(recipePayload(valid())).toMatchObject({
      name: "TESTE Brigadeiro",
      yield_units: "20",
      fee_percent: "5.49",
      final_quantity: "800.5",
    });
    expect(recipePayload({ ...valid(), yieldUnits: "", finalQuantity: "" })).toMatchObject({
      yield_units: null,
      final_quantity: null,
    });
  });
  it("rejeita rendimento zero/fracionado, taxa de 100 e quantidades negativas", () => {
    for (const patch of [
      { yieldUnits: "0" },
      { yieldUnits: "2,5" },
      { fee: "100" },
      { finalQuantity: "-5" },
      { indirect: "1001" },
    ])
      expect(() => recipePayload({ ...valid(), ...patch })).toThrow();
  });
  it("impede ingrediente duplicado na composição", () => {
    const c = {
      material_id: "aa0cb06e-043d-4612-ade4-65f7128890ac",
      quantity: "1",
      unit: "g" as const,
    };
    expect(() => recipePayload({ ...valid(), components: [c, c] })).toThrow("única vez");
  });
  it("só oferece conversão entre dimensões quando existe equivalência", () => {
    const volume = { kind: "ingredient", unit: "l", density_g_ml: null } as Material;
    expect(compatibleUnits(volume)).toEqual(["ml", "l"]);
    expect(compatibleUnits({ ...volume, density_g_ml: 1.2 })).toEqual(["ml", "l", "g", "kg"]);
    expect(compatibleUnits({ kind: "packaging", unit: "un" } as Material)).toEqual(["un"]);
    expect(
      compatibleUnits({ kind: "ingredient", unit: "un", piece_weight_g: null } as Material),
    ).toEqual(["un"]);
  });
  it("exibe centavos exatos inclusive além do limite seguro de ponto flutuante", () => {
    expect(centsValue("1219")).toBe("R$ 12,19");
    expect(centsValue("9007199254740993123")).toBe("R$ 90.071.992.547.409.931,23");
    expect(centsValue(null)).toBe("—");
  });
});
