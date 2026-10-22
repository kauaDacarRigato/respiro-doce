import { describe, expect, it } from "vitest";
import {
  emptySaleForm,
  normalizePhone,
  salePayload,
  saoPauloInput,
} from "@/features/sales/sale-domain";
describe("Telefone, data e preço da venda", () => {
  it("normaliza telefone brasileiro e preserva código internacional explícito", () => {
    expect(normalizePhone("(11) 99999-9999")).toBe("+5511999999999");
    expect(normalizePhone("5511999999999")).toBe("+5511999999999");
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
    for (const input of ["1199", "abc11999999999", "+5500999999999", "1234567890123456"])
      expect(() => normalizePhone(input)).toThrow();
  });
  it("usa São Paulo mesmo quando o aparelho está em UTC, incluindo virada de dia", () => {
    expect(saoPauloInput(new Date("2026-10-21T02:59:59Z"))).toBe("2026-10-20T23:59:59");
    expect(saoPauloInput(new Date("2026-10-21T03:00:00Z"))).toBe("2026-10-21T00:00:00");
  });
  const form = () => ({
    ...emptySaleForm(),
    recipeId: "aa0cb06e-043d-4612-ade4-65f7128890ac",
    price: "10,19",
    occurredLocal: "2026-10-20T23:59:59",
  });
  it("envia centavos inteiros e não envia dados pessoais na venda anônima", () => {
    expect(
      salePayload({ ...form(), customerName: "TESTE", customerPhone: "11999999999" }),
    ).toMatchObject({
      unit_price_cents: 1019,
      quantity: 1,
      anonymous: true,
      customer_name: null,
      customer_phone: null,
      customer_id: null,
    });
  });
  it("exige nome e telefone na identificação e quantidade inteira positiva", () => {
    expect(() => salePayload({ ...form(), anonymous: false })).toThrow("nome");
    for (const quantity of ["0", "1,5", "-1", "1000001"])
      expect(() => salePayload({ ...form(), quantity })).toThrow();
    expect(
      salePayload({
        ...form(),
        anonymous: false,
        customerName: "  TESTE   Nome  ",
        customerPhone: "11999999999",
      }),
    ).toMatchObject({ customer_name: "TESTE Nome", customer_phone: "+5511999999999" });
  });
});
