import { z } from "zod";
const uuid = z.string().uuid();
const text = (max: number, min = 0) =>
  z
    .string()
    .min(min)
    .max(max)
    .refine((s) => !s.includes("\0"));
const decimal = z
  .string()
  .max(160)
  .regex(/^\d+(\.\d+)?$/)
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    const tail = fraction.replace(/0+$/, "");
    return `${whole!.replace(/^0+(?=\d)/, "")}${tail ? `.${tail}` : ""}`;
  });
const bounded = (max: bigint, positive = false) =>
  decimal.refine((value) => {
    const [whole, fraction = ""] = value.split(".");
    const n = BigInt(whole!);
    return (
      (n < max || (n === max && !/[1-9]/.test(fraction))) &&
      (!positive || n > 0n || /[1-9]/.test(fraction))
    );
  });
const integer = (max: bigint, positive = false) =>
  z
    .string()
    .max(40)
    .regex(/^\d+$/)
    .refine((s) => BigInt(s) <= max && (!positive || BigInt(s) > 0n));
const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const dates = { created_at: instant, updated_at: instant };
const rate = bounded(100n).refine((s) => BigInt(s.split(".")[0]!) < 100n);
const amount = integer(100000000000n);
const unit = z.enum(["g", "kg", "ml", "l", "un"]);
const nutrient = bounded(1000000n).nullable();
export const backupTables = {
  business_settings: z
    .object({
      debit_fee_percent: rate,
      credit_fee_percent: rate,
      opening_balance_cents: z
        .string()
        .regex(/^-?\d+$/)
        .refine((s) => BigInt(s) >= -100000000000n && BigInt(s) <= 100000000000n),
      opening_balance_at: instant,
      currency: z.literal("BRL"),
      timezone: z.literal("America/Sao_Paulo"),
      ...dates,
    })
    .strict(),
  expense_categories: z.object({ id: uuid, name: text(100, 1), ...dates }).strict(),
  materials: z
    .object({
      id: uuid,
      name: text(120, 1),
      kind: z.enum(["ingredient", "packaging"]),
      unit,
      package_quantity: bounded(1000000000n, true),
      package_price_cents: amount,
      piece_weight_g: bounded(1000000n, true).nullable(),
      density_g_ml: bounded(1000n, true).nullable(),
      ...dates,
    })
    .strict(),
  material_nutrition: z
    .object({
      material_id: uuid,
      base_unit: z.enum(["g", "ml"]),
      source: text(500),
      energy_kcal: nutrient,
      carbohydrates_g: nutrient,
      total_sugars_g: nutrient,
      added_sugars_g: nutrient,
      proteins_g: nutrient,
      total_fat_g: nutrient,
      saturated_fat_g: nutrient,
      trans_fat_g: nutrient,
      fiber_g: nutrient,
      sodium_mg: nutrient,
    })
    .strict(),
  recipes: z
    .object({
      id: uuid,
      name: text(120, 1),
      yield_units: integer(1000000n, true).nullable(),
      indirect_percent: bounded(1000n),
      fee_percent: rate,
      final_quantity: bounded(1000000000n, true).nullable(),
      final_unit: z.enum(["g", "ml"]),
      serving_quantity: bounded(1000000000n, true).nullable(),
      serving_unit: z.enum(["g", "ml"]),
      household_measure: text(120),
      ...dates,
    })
    .strict(),
  recipe_materials: z
    .object({ recipe_id: uuid, material_id: uuid, quantity: bounded(1000000000n, true), unit })
    .strict(),
  customers: z
    .object({
      id: uuid,
      base_name: text(120, 1),
      phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
      created_at: instant,
    })
    .strict(),
  sales: z
    .object({
      id: uuid,
      recipe_id: uuid.nullable(),
      recipe_source_id: uuid,
      product_name: text(120, 1),
      customer_id: uuid.nullable(),
      customer_name: text(120, 1).nullable(),
      quantity: integer(1000000n, true),
      unit_price_cents: amount,
      unit_cost: bounded(10n ** 32n),
      debit_fee_percent: rate,
      credit_fee_percent: rate,
      payment: z.enum(["cash", "pix", "debit", "credit"]),
      applied_fee_percent: rate,
      gross_cents: decimal,
      production_cents: decimal,
      fee_cents: decimal,
      occurred_at: instant,
      ...dates,
    })
    .strict(),
  expenses: z
    .object({
      id: uuid,
      description: text(200, 1),
      amount_cents: integer(100000000000n, true),
      category_id: uuid.nullable(),
      occurred_at: instant,
      ...dates,
    })
    .strict(),
};
export const tableOrder = Object.keys(backupTables) as (keyof typeof backupTables)[];
export const payloadSchema = z
  .object({
    schema: z.literal("respiro-doce-account"),
    version: z.literal(1),
    account_id: uuid,
    exported_at: instant,
    revision: z.string().regex(/^\d+$/),
    data: z
      .object({
        business_settings: backupTables.business_settings,
        expense_categories: z.array(backupTables.expense_categories),
        materials: z.array(backupTables.materials),
        material_nutrition: z.array(backupTables.material_nutrition),
        recipes: z.array(backupTables.recipes),
        recipe_materials: z.array(backupTables.recipe_materials),
        customers: z.array(backupTables.customers),
        sales: z.array(backupTables.sales),
        expenses: z.array(backupTables.expenses),
      })
      .strict(),
  })
  .strict();
export type BackupPayload = z.infer<typeof payloadSchema>;
export function validatePayload(input: unknown): BackupPayload {
  const result = payloadSchema.safeParse(input);
  if (!result.success)
    throw new Error("Arquivo incompatível: versão, campos ou valores inválidos.");
  const p = result.data;
  const d = p.data;
  const ids = new Map<string, Set<string>>();
  for (const table of tableOrder) {
    if (table === "business_settings") continue;
    const values = d[table] as Record<string, unknown>[];
    const set = new Set<string>();
    for (const row of values) {
      const key =
        table === "material_nutrition"
          ? String(row["material_id"])
          : table === "recipe_materials"
            ? `${row["recipe_id"]}:${row["material_id"]}`
            : String(row["id"]);
      if (set.has(key)) throw new Error("Arquivo com identificadores duplicados.");
      set.add(key);
    }
    ids.set(table, set);
  }
  const linked = (table: string, id: unknown) => id === null || ids.get(table)!.has(String(id));
  if (
    d.material_nutrition.some((n) => !linked("materials", n.material_id)) ||
    d.recipe_materials.some(
      (r) => !linked("recipes", r.recipe_id) || !linked("materials", r.material_id),
    ) ||
    d.sales.some(
      (s) =>
        !linked("recipes", s.recipe_id) ||
        !linked("customers", s.customer_id) ||
        (s.customer_id === null) !== (s.customer_name === null),
    ) ||
    d.expenses.some((e) => !linked("expense_categories", e.category_id))
  )
    throw new Error("Arquivo com referências ausentes ou incompatíveis.");
  return p;
}
async function digest(payload: BackupPayload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export async function encodeBackup(input: unknown) {
  const payload = validatePayload(input);
  const file = JSON.stringify(
    { format: "respiro-doce-backup", version: 1, checksum_sha256: await digest(payload), payload },
    null,
    2,
  );
  if (new TextEncoder().encode(file).byteLength > 20000000)
    throw new Error("A cópia completa supera 20 MB. Solicite uma exportação administrativa.");
  return file;
}
export async function decodeBackup(contents: string) {
  if (new TextEncoder().encode(contents).byteLength > 20000000)
    throw new Error("Limite de 20 MB por arquivo.");
  let input: unknown;
  try {
    input = JSON.parse(contents);
  } catch {
    throw new Error("Este arquivo não é um JSON válido.");
  }
  const envelope = z
    .object({
      format: z.literal("respiro-doce-backup"),
      version: z.literal(1),
      checksum_sha256: z.string().regex(/^[0-9a-f]{64}$/),
      payload: payloadSchema,
    })
    .strict()
    .safeParse(input);
  if (!envelope.success) throw new Error("Formato ou versão de backup incompatível.");
  const payload = validatePayload(envelope.data.payload);
  if ((await digest(payload)) !== envelope.data.checksum_sha256)
    throw new Error("O conteúdo não confere com a verificação de integridade.");
  return payload;
}
