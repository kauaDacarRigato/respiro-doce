import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NutritionSheet } from "@/features/nutrition/nutrition-sheet";
import { nutritionRows, type NutritionReport } from "@/features/nutrition/nutrition-domain";
const mock = vi.hoisted(() => ({ read: vi.fn(), download: vi.fn(), png: vi.fn() }));
vi.mock("@/features/data/export-data", () => ({
  readNutrition: mock.read,
  downloadBlob: mock.download,
}));
vi.mock("@/features/nutrition/nutrition-png", () => ({ nutritionPng: mock.png }));
vi.mock("@/features/sync/account-sync-context", () => ({
  useAccountSync: () => ({ online: true }),
}));
function sample(): NutritionReport {
  return {
    ready: true,
    kind: "estimate-not-label",
    calculated_at: "2026-10-22T12:00:00Z",
    reference: "test",
    issues: [],
    recipe: {
      id: "r",
      name: "TESTE Doce",
      final_quantity: "100",
      final_unit: "g",
      serving_quantity: "20",
      serving_unit: "g",
      household_measure: "1 doce",
    },
    rows: nutritionRows.map(([key]) => ({ key, total: "0", per100: "0", portion: "0", vd: null })),
    ingredients: [
      {
        id: "m",
        name: "Ingrediente",
        quantity: "100",
        unit: "g",
        base_unit: "g",
        used_base: "100",
        source: "Fonte original",
        contributions: {} as NutritionReport["ingredients"][number]["contributions"],
      },
    ],
  };
}
function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <NutritionSheet owner="a" id="r" onClose={() => {}} />
    </QueryClientProvider>,
  );
  return cache;
}
describe("confirmação dos dados nutricionais exportados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.read.mockResolvedValue(sample());
    mock.png.mockResolvedValue(new Blob(["PNG"]));
  });
  afterEach(cleanup);
  it("retira confirmação quando fontes mudam sem apagar a memória", async () => {
    const cache = mount();
    await screen.findByText("TESTE Doce");
    fireEvent.click(screen.getByRole("checkbox"));
    const changed = sample();
    changed.ingredients[0]!.source = "Fonte nova";
    mock.read.mockResolvedValue(changed);
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["nutrition"] });
    });
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(mock.download).not.toHaveBeenCalled();
  });
  it("recusa baixar dados diferentes dos conferidos na tela", async () => {
    mount();
    await screen.findByText("TESTE Doce");
    fireEvent.click(screen.getByRole("checkbox"));
    const changed = sample();
    changed.recipe.final_quantity = "200";
    mock.read.mockResolvedValue(changed);
    fireEvent.click(screen.getByRole("button", { name: "Baixar memória PNG (1080 px)" }));
    await screen.findByRole("alert");
    expect(mock.download).not.toHaveBeenCalled();
    expect(mock.png).not.toHaveBeenCalled();
  });
  it("permite uma leitura nova dos mesmos dados, mesmo com outro horário de cálculo", async () => {
    mount();
    await screen.findByText("TESTE Doce");
    fireEvent.click(screen.getByRole("checkbox"));
    const current = sample();
    current.calculated_at = "2026-10-22T12:01:00Z";
    mock.read.mockResolvedValue(current);
    fireEvent.click(screen.getByRole("button", { name: "Baixar memória PNG (1080 px)" }));
    await waitFor(() => expect(mock.download).toHaveBeenCalledTimes(1));
  });
});
