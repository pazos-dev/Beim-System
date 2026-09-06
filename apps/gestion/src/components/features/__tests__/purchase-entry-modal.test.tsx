// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../test/query-client";
import { useUiStore } from "../../../lib/ui-store";
import { ToastProvider } from "../../ui/Toast";
import { PurchaseEntryModal } from "../PurchaseEntryModal";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function purchasedPayload(): Response {
  return jsonResponse({ data: { compra: { id: "c_1" } }, ok: true }, 201);
}

function renderModal(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <PurchaseEntryModal />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useUiStore.setState({ purchaseModalOpen: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useUiStore.setState({ purchaseModalOpen: false });
});

describe("PurchaseEntryModal", () => {
  it("validates cantidad and costo with the domain schema before posting", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.click(screen.getByRole("button", { name: "Registrar compra" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a fresh x-idempotency-key per attempt", async () => {
    const user = userEvent.setup();
    const keys: Array<string | null> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      keys.push((init?.headers as Record<string, string> | undefined)?.["x-idempotency-key"] ?? null);
      if (keys.length === 1) return jsonResponse({ ok: false }, 500);
      return purchasedPayload();
    });
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("key-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("key-2" as `${string}-${string}-${string}-${string}-${string}`);
    renderModal();

    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "10");
    await user.type(screen.getByLabelText("Costo unitario"), "120");
    await user.type(screen.getByLabelText("Proveedor"), "Proveedor Uno");
    await user.click(screen.getByRole("button", { name: "Registrar compra" }));
    expect(await screen.findByText("No se pudo registrar la compra. Reintentá.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar compra" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(keys).toEqual(["key-1", "key-2"]);
  });

  it("shows a success toast and closes on 201", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(purchasedPayload());
    renderModal();

    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "10");
    await user.type(screen.getByLabelText("Costo unitario"), "120");
    await user.type(screen.getByLabelText("Proveedor"), "Proveedor Uno");
    await user.click(screen.getByRole("button", { name: "Registrar compra" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Compra registrada correctamente.");
    expect(useUiStore.getState().purchaseModalOpen).toBe(false);
  });

  it("closes without posting when cancelled", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
