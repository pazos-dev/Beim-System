// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQueryClient } from "../../../test/query-client";
import { Dashboard } from "../Dashboard";

const BASE_DATA = {
  clientes: [{ id: "c_1", ownerId: "u-admin", version: 1, displayName: "Acme" }],
  gastos: [{ id: "g_1", ownerId: "u-admin", version: 1, descripcion: "Luz", importe: 150, fecha: "2026-09-04T10:00:00.000Z", medio: "efectivo" }],
  ordenes: [
    { id: "o_9", ownerId: "u-admin", version: 1, clienteId: "c_1", numero: "0001-9", estado: "en_proceso", paymentStatus: "pendiente", total: 500 }
  ],
  productos: [
    { id: "p_1", ownerId: "u-admin", version: 1, displayName: "Tornillo", price: 100, cost: 50, stock: 2, minimum: 5, active: true },
    { id: "p_2", ownerId: "u-admin", version: 1, displayName: "Tuerca", price: 80, cost: 40, stock: 30, minimum: 5, active: true }
  ],
  sesionesCaja: [
    { id: "sc_1", ownerId: "u-admin", version: 1, fecha: "2026-09-04", apertura: 5000, esperado: 6200, contado: 6200, diferencia: 0, estado: "abierta" }
  ]
};

function bootstrapResponse(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("Dashboard con payload real del bootstrap", () => {
  it("deriva métricas, órdenes recientes, stock bajo y caja abierta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bootstrapResponse(BASE_DATA)));
    renderWithQueryClient(<Dashboard />);

    await waitFor(() => expect(screen.getByText("0001-9")).toBeInTheDocument());
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Tornillo")).toBeInTheDocument();
    expect(screen.getByText("Caja abierta del día 2026-09-04.")).toBeInTheDocument();
    const metrics = screen.getByLabelText("Métricas diarias");
    expect(metrics).toHaveTextContent("Órdenes del día");
    expect(fetch).toHaveBeenCalledWith("/api/gestion/bootstrap", { cache: "no-store" });
  });

  it("muestra error recuperable y reintenta la carga", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("caída")).mockResolvedValueOnce(bootstrapResponse(BASE_DATA));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQueryClient(<Dashboard />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.getByText("0001-9")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("muestra estado vacío sin movimientos", async () => {
    const empty = { ...BASE_DATA, clientes: [], gastos: [], ordenes: [], productos: [], sesionesCaja: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bootstrapResponse(empty)));
    renderWithQueryClient(<Dashboard />);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Todavía no hay movimientos para mostrar."));
  });
});
