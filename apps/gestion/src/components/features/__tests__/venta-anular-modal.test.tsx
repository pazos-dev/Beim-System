// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../test/query-client";
import { useUiStore } from "../../../lib/ui-store";
import { ToastProvider } from "../../ui/Toast";
import { VentaAnularModal } from "../VentaAnularModal";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function anuladaPayload(): Response {
  return jsonResponse(
    { data: { estado: "anulada", id: "v_1", numero: "V-0001", total: 2500, version: 2 }, ok: true },
    200
  );
}

function renderModal(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <VentaAnularModal />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useUiStore.setState({ ventaAnularModalId: "v_1" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useUiStore.setState({ ventaAnularModalId: null });
});

describe("VentaAnularModal", () => {
  it("validates motivo length before patching", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Anular venta" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Motivo"), "x".repeat(201));
    await user.click(screen.getByRole("button", { name: "Anular venta" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a fresh x-idempotency-key per attempt", async () => {
    const user = userEvent.setup();
    const calls: Array<{ key: string | null; url: string }> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        key: (init?.headers as Record<string, string> | undefined)?.["x-idempotency-key"] ?? null,
        url: String(input)
      });
      if (calls.length === 1) return jsonResponse({ ok: false }, 500);
      return anuladaPayload();
    });
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("key-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("key-2" as `${string}-${string}-${string}-${string}-${string}`);
    renderModal();

    await user.type(screen.getByLabelText("Motivo"), "Error de facturación");
    await user.click(screen.getByRole("button", { name: "Anular venta" }));
    expect(await screen.findByText("No se pudo anular la venta. Reintentá.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anular venta" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("/api/gestion/ventas/v_1");
    expect(calls.map((call) => call.key)).toEqual(["key-1", "key-2"]);
  });

  it("shows a success toast and clears the target on 200", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(anuladaPayload());
    renderModal();

    await user.type(screen.getByLabelText("Motivo"), "Error de facturación");
    await user.click(screen.getByRole("button", { name: "Anular venta" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Venta anulada correctamente.");
    expect(useUiStore.getState().ventaAnularModalId).toBeNull();
  });

  it("closes without patching when cancelled", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useUiStore.getState().ventaAnularModalId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
