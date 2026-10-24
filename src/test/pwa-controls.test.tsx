import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaControls } from "@/features/pwa/pwa-controls";
import { hasUpdateBlocker } from "@/features/pwa/update-guard";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("instalação e proteção dos formulários", () => {
  it("oferece orientação para iPhone e não simula um prompt indisponível", () => {
    render(<PwaControls />);
    fireEvent.click(screen.getByRole("button", { name: "Como instalar" }));
    expect(screen.getByText(/No iPhone ou iPad/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Instalar aplicativo" })).toBeNull();
  });
  it("só abre o prompt nativo após clique e oculta controles ao instalar", async () => {
    render(<PwaControls />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(prompt).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Instalar aplicativo" }));
    });
    expect(prompt).toHaveBeenCalledOnce();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
  it("bloqueia atualização por edição, operação ou diálogo e libera quando a edição é fechada", () => {
    const form = document.createElement("form");
    document.body.append(form);
    const dirty = new Set([form]);
    expect(hasUpdateBlocker(dirty)).toBe(true);
    form.remove();
    expect(hasUpdateBlocker(dirty)).toBe(false);
    const busy = document.createElement("div");
    busy.setAttribute("aria-busy", "true");
    document.body.append(busy);
    expect(hasUpdateBlocker(dirty)).toBe(true);
    busy.remove();
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    expect(hasUpdateBlocker(dirty)).toBe(true);
    dialog.remove();
    expect(hasUpdateBlocker(dirty)).toBe(false);
  });
});
