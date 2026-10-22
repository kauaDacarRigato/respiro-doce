import { describe, expect, it } from "vitest";
import { barHeights, bucketLabel, openingPayload, signedInput } from "./finance-domain";
describe("saldo inicial e gráfico financeiro", () => {
  it("preserva centavos e sinal no limite permitido", () => {
    for (const cents of ["-100000000000", "-1", "0", "1", "100000000000"]) {
      expect(
        openingPayload({
          amount: signedInput(cents),
          occurredLocal: "2026-10-01T00:00",
          confirm: true,
        }).amount_cents,
      ).toBe(Number(cents));
    }
  });
  it("exige confirmação e rejeita formatos ambíguos, frações e excesso", () => {
    const base = { amount: "100", occurredLocal: "2026-10-01T00:00", confirm: true };
    expect(() => openingPayload({ ...base, confirm: false })).toThrow("Confirme");
    for (const amount of ["--1", "+1", "1,234", "-1000000000,01", ""])
      expect(() => openingPayload({ ...base, amount })).toThrow();
    expect(() => openingPayload({ ...base, occurredLocal: "" })).toThrow("data");
  });
  it("normaliza apenas alturas de números muito maiores que a precisão de Number", () => {
    expect(barHeights(["0", "0"])).toEqual([0, 0]);
    expect(
      barHeights([
        "-1000000000000000000000000000000000000000",
        "500000000000000000000000000000000000000",
        "0",
      ]),
    ).toEqual([100, 50, 0]);
    expect(barHeights([])).toEqual([]);
  });
  it("rotula intervalos pelo calendário local sem deslocar fuso", () => {
    expect(bucketLabel("2026-10-01T00:00", "day")).toBe("00h");
    expect(bucketLabel("2026-10-01T00:00", "month")).toBe("01");
    expect(bucketLabel("2026-01-01T00:00", "year")).toMatch(/jan/);
  });
});
