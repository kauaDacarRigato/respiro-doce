import ExcelJS from "exceljs";
import type { Customer } from "@/features/sales/sale-domain";
import { dateLabel } from "@/features/sales/sale-domain";
export async function customersWorkbook(items: Customer[], search: string, exportedAt: string) {
  const book = new ExcelJS.Workbook();
  book.creator = "Respiro Doce";
  book.created = new Date(exportedAt);
  const sheet = book.addWorksheet("Clientes", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Nome", width: 38 },
    { header: "Telefone (texto)", width: 23 },
    { header: "Itens comprados", width: 20 },
    { header: "Total comprado (R$, texto)", width: 29 },
    { header: "Última compra (São Paulo)", width: 28 },
  ];
  for (const c of items) {
    const cents = BigInt(c.total_cents);
    const value = `${cents / 100n},${String(cents % 100n).padStart(2, "0")}`;
    sheet.addRow([
      c.name,
      c.phone,
      c.items,
      value,
      c.last_purchase ? dateLabel(c.last_purchase) : "Sem compras",
    ]);
  }
  // User values are string cells, never formula/hyperlink objects. This keeps +,
  // =, @, leading zeroes and amounts beyond Excel's 15-digit limit as exact text.
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      cell.numFmt = "@";
    }),
  );
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF185B31" } };
  sheet.autoFilter = { from: "A1", to: `E${Math.max(1, items.length + 1)}` };
  const info = book.addWorksheet("Sobre a exportação");
  info.addRows([
    ["Filtro", search || "Todos os clientes"],
    ["Exportado em", dateLabel(exportedAt)],
    ["Linhas", String(items.length)],
    ["Valores", "Valores em reais e contagens como texto, para preservar a precisão."],
    [
      "Origem",
      "Todos os clientes encontrados pelo filtro, em todas as páginas, na ordem nome e identificador.",
    ],
  ]);
  info.columns = [{ width: 22 }, { width: 100 }];
  return new Uint8Array(await book.xlsx.writeBuffer());
}
