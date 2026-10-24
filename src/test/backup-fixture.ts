import type { BackupPayload } from "@/features/data/backup-format";
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function backupFixture(): BackupPayload {
  const instant = "2026-10-20T12:00:00.000Z",
    dates = { created_at: instant, updated_at: instant };
  return {
    schema: "respiro-doce-account",
    version: 1,
    account_id: fixtureId(1),
    exported_at: instant,
    revision: "12",
    data: {
      business_settings: {
        debit_fee_percent: "2",
        credit_fee_percent: "5.49",
        opening_balance_cents: "10000",
        opening_balance_at: "2026-10-01T03:00:00.000Z",
        currency: "BRL",
        timezone: "America/Sao_Paulo",
        ...dates,
      },
      expense_categories: [{ id: fixtureId(2), name: "Operação", ...dates }],
      materials: [
        {
          id: fixtureId(3),
          name: "Cacau 'especial'",
          kind: "ingredient",
          unit: "kg",
          package_quantity: "1",
          package_price_cents: "3072",
          piece_weight_g: null,
          density_g_ml: null,
          ...dates,
        },
      ],
      material_nutrition: [
        {
          material_id: fixtureId(3),
          base_unit: "g",
          source: "Rótulo conferido",
          energy_kcal: "400",
          carbohydrates_g: "60",
          total_sugars_g: "50",
          added_sugars_g: "40",
          proteins_g: "10",
          total_fat_g: "5",
          saturated_fat_g: "2",
          trans_fat_g: "0",
          fiber_g: "3",
          sodium_mg: "20",
        },
      ],
      recipes: [
        {
          id: fixtureId(4),
          name: "Brigadeiro",
          yield_units: "5",
          indirect_percent: "25",
          fee_percent: "5.49",
          final_quantity: "400",
          final_unit: "g",
          serving_quantity: "20",
          serving_unit: "g",
          household_measure: "1 doce",
          ...dates,
        },
      ],
      recipe_materials: [
        { recipe_id: fixtureId(4), material_id: fixtureId(3), quantity: "500", unit: "g" },
      ],
      customers: [
        {
          id: fixtureId(5),
          base_name: '=HYPERLINK("https://example.invalid")',
          phone: "+5511999999999",
          created_at: instant,
        },
      ],
      sales: [
        {
          id: fixtureId(6),
          recipe_id: null,
          recipe_source_id: fixtureId(99),
          product_name: "Produto excluído $verify$",
          customer_id: fixtureId(5),
          customer_name: '=HYPERLINK("https://example.invalid")',
          quantity: "2",
          unit_price_cents: "1000",
          unit_cost: "3.84",
          debit_fee_percent: "2",
          credit_fee_percent: "5.49",
          payment: "credit",
          applied_fee_percent: "5.49",
          gross_cents: "2000",
          production_cents: "768",
          fee_cents: "110",
          occurred_at: instant,
          ...dates,
        },
      ],
      expenses: [
        {
          id: fixtureId(7),
          description: "Gás",
          amount_cents: "200",
          category_id: fixtureId(2),
          occurred_at: instant,
          ...dates,
        },
      ],
    },
  };
}
