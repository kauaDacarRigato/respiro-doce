import { describe, expect, it } from "vitest";
import { nutritionNumber } from "@/features/nutrition/nutrition-domain";
describe("apresentação nutricional exata", () => {
  it("arredonda apenas a apresentação, sem perder valores maiores que Number", () => {
    expect(nutritionNumber("9999999999999999999999.995")).toBe("10.000.000.000.000.000.000.000,00");
    expect(nutritionNumber("0.0049")).toBe("0,00");
    expect(nutritionNumber("0.005")).toBe("0,01");
    expect(nutritionNumber(null)).toBe("—");
  });
  it("rejeita NaN, números negativos e formatos que não vêm do cálculo", () => {
    for (const x of ["NaN", "Infinity", "-1", "1e10", ""])
      expect(() => nutritionNumber(x)).toThrow();
  });
});
