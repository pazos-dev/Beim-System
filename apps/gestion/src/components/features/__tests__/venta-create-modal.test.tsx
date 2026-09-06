// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../test/query-client";
import { useUiStore } from "../../../lib/ui-store";
import { ToastProvider } from "../../ui/Toast";
import { VentaCreateModal } from "../VentaCreateModal";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function createdPayload(): Response {
  return jsonResponse(
    { data: { estado: "confirmada", id: "v_1", numero: "V-0001", total: 2500, version: 1 }, ok: true },
    201
  );
}

function renderModal(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <VentaCreateModal />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useUiStore.setState({ ventaCreateModalOpen: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useUiStore.setState({ ventaCreateModalOpen: false });
});

describe("VentaCreateModal", () => {
  it("validates producto and cantidad with the domain schema before posting", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Crear venta" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows catalog prices as read-only and never posts a client precio", async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      postedBody = JSON.parse(String(init?.body ?? "null"));
      return createdPayload();
    });
    renderModal();
    expect(await screen.findByText("El precio se toma del catálogo y no se puede editar.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "2");
    await user.type(screen.getByLabelText("Monto del pago"), "2500");
    await user.click(screen.getByRole("button", { name: "Crear venta" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.stringify(postedBody)).not.toContain("precio");
    const body = postedBody as { items: Array<Record<string, unknown>> };
    expect(body.items).toEqual([{ cantidad: 2, productoId: "p_1" }]);
  });

  it("sends a fresh x-idempotency-key per attempt", async () => {
    const user = userEvent.setup();
    const keys: Array<string | null> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      keys.push((init?.headers as Record<string, string> | undefined)?.["x-idempotency-key"] ?? null);
      if (keys.length === 1) return jsonResponse({ ok: false }, 500);
      return createdPayload();
    });
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("key-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("key-2" as `${string}-${string}-${string}-${string}-${string}`);
    renderModal();

    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "2");
    await user.type(screen.getByLabelText("Monto del pago"), "2500");
    await user.click(screen.getByRole("button", { name: "Crear venta" }));
    expect(await screen.findByText("No se pudo crear la venta. Reintentá.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Crear venta" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(keys).toEqual(["key-1", "key-2"]);
  });

  it("shows a success toast and closes on 201", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdPayload());
    renderModal();

    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "2");
    await user.type(screen.getByLabelText("Monto del pago"), "2500");
    await user.click(screen.getByRole("button", { name: "Crear venta" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Venta creada correctamente.");
    expect(useUiStore.getState().ventaCreateModalOpen).toBe(false);
  });

  it("closes without posting when cancelled", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
