import { nutritionNumber, nutritionRows, type NutritionReport } from "./nutrition-domain";
export async function nutritionPng(report: NutritionReport): Promise<Blob> {
  if (!report.ready || report.rows.length !== 11 || report.kind !== "estimate-not-label")
    throw new Error("Complete os dados antes de exportar a memória de cálculo.");
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1320;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Este navegador não conseguiu gerar a imagem.");
  const wrap = (text: string, font: string) => {
    c.font = font;
    const lines: string[] = [];
    let line = "";
    for (const character of text) {
      if (c.measureText(line + character).width > 990 && line) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    lines.push(line);
    return lines;
  };
  const nameLines = wrap(report.recipe.name, "bold 28px Arial");
  const measureLines = wrap(report.recipe.household_measure, "24px Arial");
  const infoY = Math.max(240, 162 + (nameLines.length - 1) * 34 + 50);
  const top = Math.max(380, infoY + 115 + (measureLines.length - 1) * 32);
  canvas.height = Math.max(1320, top + 940);
  c.fillStyle = "white";
  c.fillRect(0, 0, 1080, canvas.height);
  c.fillStyle = "#111";
  c.font = "bold 38px Arial";
  c.fillText("MEMÓRIA DE CÁLCULO NUTRICIONAL", 40, 65);
  c.fillStyle = "#9b1c1c";
  c.font = "bold 30px Arial";
  c.fillText("ESTIMATIVA — NÃO USAR COMO RÓTULO", 40, 113);
  c.fillStyle = "#111";
  c.font = "bold 28px Arial";
  nameLines.forEach((line, i) => c.fillText(line, 40, 162 + i * 34));
  const y = infoY;
  c.font = "24px Arial";
  c.fillText(
    `Lote final: ${nutritionNumber(report.recipe.final_quantity)} ${report.recipe.final_unit}`,
    40,
    y,
  );
  c.fillText(
    `Porção informada: ${nutritionNumber(report.recipe.serving_quantity)} ${report.recipe.serving_unit}`,
    40,
    y + 36,
  );
  measureLines.forEach((line, i) => c.fillText(line, 40, y + 72 + i * 32));
  c.fillRect(40, top, 1000, 3);
  c.font = "bold 23px Arial";
  c.fillText("Nutriente", 52, top + 38);
  c.fillText(`100 ${report.recipe.final_unit}`, 600, top + 38);
  c.fillText("Porção", 775, top + 38);
  c.fillText("%VD*", 955, top + 38);
  let rowY = top + 92;
  for (const [key, label, unit] of nutritionRows) {
    const row = report.rows.find((r) => r.key === key)!;
    c.font = "23px Arial";
    c.fillText(`${label} (${unit})`, 52, rowY);
    c.textAlign = "right";
    const drawValue = (value: string | null, x: number, width: number) => {
      const text = nutritionNumber(value);
      let size = 23;
      while (size > 18 && c.measureText(text).width > width) {
        size--;
        c.font = `${size}px Arial`;
      }
      if (c.measureText(text).width > width)
        throw new Error("Valor muito extenso para o PNG. Consulte a memória na tela.");
      c.fillText(text, x, rowY);
      c.font = "23px Arial";
    };
    drawValue(row.per100, 730, 160);
    drawValue(row.portion, 910, 160);
    drawValue(row.vd, 1020, 90);
    c.textAlign = "left";
    c.fillStyle = "#aaa";
    c.fillRect(40, rowY + 18, 1000, 1);
    c.fillStyle = "#111";
    rowY += 55;
  }
  c.font = "22px Arial";
  const notes = [
    "* %VD estimado para adultos, com valores sem arredondamento normativo.",
    "Açúcares totais, gorduras trans e kJ: sem %VD nesta memória.",
    "Soma dos ingredientes cadastrados; sem fatores de retenção do processo.",
    "kJ é conversão auxiliar (kcal × 4,184), fora do modelo de rótulo.",
    "Porção, embalagem e eventual rotulagem frontal exigem revisão específica.",
    `Calculado em ${new Date(report.calculated_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · Respiro Doce`,
  ];
  notes.forEach((note, i) => c.fillText(note, 40, rowY + 30 + i * 32));
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar o PNG."))),
      "image/png",
    ),
  );
}
