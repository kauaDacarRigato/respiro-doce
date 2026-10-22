import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AccountSyncContext, type SyncState } from "@/features/sync/account-sync-context";
import { ConcurrentEditNotice } from "@/features/sync/concurrent-edit-notice";
describe("aviso de edição concorrente", () => {
  afterEach(cleanup);
  it("avisa quando a revisão muda sem substituir a digitação", () => {
    const state = (revision: string | null): SyncState => ({
      revision,
      online: true,
      phase: "current",
      realtime: true,
      retry: () => {},
    });
    const view = (revision: string | null) => (
      <AccountSyncContext.Provider value={state(revision)}>
        <ConcurrentEditNotice editing />
        <input aria-label="Digitação" defaultValue="rascunho" />
      </AccountSyncContext.Provider>
    );
    const { rerender } = render(view(null));
    rerender(view("1"));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(view("2"));
    expect(screen.getByRole("status")).toHaveTextContent("Sua digitação foi mantida");
    expect(screen.getByLabelText("Digitação")).toHaveValue("rascunho");
  });
});
