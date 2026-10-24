import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataPage } from "@/features/data/data-page";
import { backupFixture } from "./backup-fixture";
const mock = vi.hoisted(() => ({ decode: vi.fn() }));
vi.mock("@/features/data/backup-format", async (original) => ({
  ...(await original<typeof import("@/features/data/backup-format")>()),
  decodeBackup: mock.decode,
}));
vi.mock("@/features/sync/account-sync-context", () => ({
  useAccountSync: () => ({ online: true }),
}));
describe("conferência do arquivo escolhido", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });
  it("ignora resultado tardio de um arquivo que já foi substituído", async () => {
    let release!: (value: unknown) => void;
    mock.decode
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("Arquivo novo corrompido"));
    render(<DataPage />);
    const file = (name: string) => {
      const f = new File(["{}"], name, { type: "application/json" });
      Object.defineProperty(f, "text", { value: async () => "{}" });
      return f;
    };
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Arquivo de backup"), {
        target: { files: [file("antigo.json")] },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Arquivo de backup"), {
        target: { files: [file("novo.json")] },
      });
    });
    await screen.findByText("Arquivo novo corrompido");
    await act(async () => {
      release(backupFixture());
    });
    expect(screen.queryByText(/Arquivo íntegro e estrutura compatível/)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Arquivo novo corrompido");
  });
});
