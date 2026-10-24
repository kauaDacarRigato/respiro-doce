// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeBackup, encodeBackup, validatePayload } from "@/features/data/backup-format";
import { backupFixture, fixtureId } from "./backup-fixture";
describe("backup versionado e íntegro", () => {
  it("preserva campos históricos, nulos e decimais longos sem credenciais", async () => {
    const p = backupFixture();
    p.data.sales[0]!.unit_cost = "3.8400000000000000000000000000000000000000";
    p.data.material_nutrition[0]!.fiber_g = null;
    const file = await encodeBackup(p);
    expect(await decodeBackup(file)).toEqual(validatePayload(p));
    expect(file).not.toContain('"owner_id"');
    expect(file).not.toContain('"password"');
  });
  it("bloqueia arquivo modificado, versão desconhecida e campos extras", async () => {
    const file = await encodeBackup(backupFixture());
    await expect(
      decodeBackup(file.replace('"revision": "12"', '"revision": "13"')),
    ).rejects.toThrow("integridade");
    await expect(decodeBackup(file.replace('"version": 1', '"version": 2'))).rejects.toThrow(
      "incompatível",
    );
    expect(() => validatePayload({ ...backupFixture(), token: "proibido" })).toThrow();
  });
  it("rejeita duplicados e vínculos ausentes antes de produzir SQL", () => {
    const p = backupFixture();
    p.data.materials.push({ ...p.data.materials[0]! });
    expect(() => validatePayload(p)).toThrow("duplicados");
    p.data.materials.pop();
    p.data.expenses[0]!.category_id = fixtureId(999);
    expect(() => validatePayload(p)).toThrow("referências");
  });
  it("valida o limite decimal sem arredondar para Number", () => {
    const p = backupFixture();
    p.data.sales[0]!.unit_cost = "100000000000000000000000000000000";
    expect(() => validatePayload(p)).not.toThrow();
    p.data.sales[0]!.unit_cost = "100000000000000000000000000000001";
    expect(() => validatePayload(p)).toThrow();
  });
});
