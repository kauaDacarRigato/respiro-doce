// @vitest-environment node
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { customersWorkbook } from "@/features/data/customers-xlsx";
import type { Customer } from "@/features/sales/sale-domain";
describe("Excel de clientes", () => {
  it("gera XLSX real, mantendo telefone, centavos grandes e conteúdo como texto", async () => {
    const rows = [
      {
        id: "a",
        name: '=HYPERLINK("https://example.invalid")',
        phone: "+5511999999999",
        items: "99999999999999999",
        total_cents: "99999999999999999",
        last_purchase: "2026-10-21T02:59:59Z",
        purchases: "1",
      },
    ] as Customer[];
    const bytes = await customersWorkbook(rows, "=HYPERLINK", "2026-10-22T12:00:00Z");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = book.getWorksheet("Clientes")!;
    expect(sheet.rowCount).toBe(2);
    expect(sheet.getCell("A2").type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell("A2").value).toBe(rows[0]!.name);
    expect(sheet.getCell("B2").value).toBe("+5511999999999");
    expect(sheet.getCell("D2").value).toBe("999999999999999,99");
    expect(sheet.getCell("E2").value).toContain("20/10/2026");
    expect(sheet.getCell("A2").formula).toBeUndefined();
    expect(book.getWorksheet("Sobre a exportação")!.getCell("B1").value).toBe("=HYPERLINK");
  });
});
