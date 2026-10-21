import { describe, expect, it } from "vitest";
import {
  decimalInput,
  emptyMaterialForm,
  materialPayload,
  missingNutrition,
  priceInCents,
  unitCost,
  type Material,
} from "@/features/products/material-domain";

describe("Custos e validações dos cadastros", () => {
  it("interpreta centavos exatos, vírgula e agrupamento brasileiro", () => {
    expect(priceInCents("12,90")).toBe(1290);
    expect(priceInCents("1.234,56")).toBe(123456);
    expect(priceInCents("0,29")).toBe(29);
    expect(priceInCents("0")).toBe(0);
    expect(() => priceInCents("1,999")).toThrow();
    expect(() => priceInCents("-5")).toThrow();
  });
  it("recusa números ambíguos, infinitos e precisão excessiva", () => {
    for (const value of ["1,2,3", "NaN", "Infinity", "1e9", "1.2.3", "0.0000001"])
      expect(() => decimalInput(value)).toThrow();
  });
  it("converte kg para g e L para mL sem presumir densidade", () => {
    expect(unitCost({ unit: "kg", package_quantity: 2, package_price_cents: 2000 })).toEqual({
      unit: "g",
      value: 0.01,
    });
    expect(unitCost({ unit: "l", package_quantity: 1, package_price_cents: 500 })).toEqual({
      unit: "mL",
      value: 0.005,
    });
    expect(unitCost({ unit: "un", package_quantity: 100, package_price_cents: 2000 })).toEqual({
      unit: "unidade",
      value: 0.2,
    });
  });
  it("normaliza nome e mantém zero diferente de informação ausente", () => {
    const form = {
      ...emptyMaterialForm(),
      name: "  TESTE   Farinha  ",
      quantity: "1",
      price: "8,90",
    };
    form.nutrients.energy_kcal = "0";
    const payload = materialPayload(form);
    expect(payload.name).toBe("TESTE Farinha");
    expect(payload.nutrition?.["energy_kcal"]).toBe("0");
    expect(payload.nutrition?.["sodium_mg"]).toBeNull();
  });
  it("exige quantidade inteira por unidade para embalagem e exclui nutrição", () => {
    const form = {
      ...emptyMaterialForm(),
      name: "TESTE pote",
      kind: "packaging" as const,
      unit: "un" as const,
      quantity: "100",
      price: "20",
    };
    expect(materialPayload(form).nutrition).toBeNull();
    expect(() => materialPayload({ ...form, quantity: "1,5" })).toThrow();
    expect(() => materialPayload({ ...form, unit: "g" })).toThrow();
  });
  it("bloqueia quantidade zero e nutrientes negativos", () => {
    const form = { ...emptyMaterialForm(), name: "TESTE", quantity: "0", price: "0" };
    expect(() => materialPayload(form)).toThrow();
    form.quantity = "1";
    form.nutrients.energy_kcal = "-1";
    expect(() => materialPayload(form)).toThrow();
  });
  it("não exige nutrientes de embalagens", () => {
    expect(missingNutrition({ kind: "packaging", nutrition: null } as Material)).toBe(false);
    expect(missingNutrition({ kind: "ingredient", nutrition: null } as Material)).toBe(true);
  });
});
