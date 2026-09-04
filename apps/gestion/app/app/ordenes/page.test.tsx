// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrdenesPage from "./page";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

const ORDERS = [
  { clienteId: "cli-1", estado: "en_diagnostico", id: "ord-1", numero: "ORD-001", ownerId: "u-1", paymentStatus: "pendiente", secreto: "no-mostrar", total: 1500, version: 1 },
  { clienteId: "cli-2", estado: "aprobado", id: "ord-2", numero: "ORD-002", ownerId: "u-1", paymentStatus: "pagado", total: 2500, version: 1 }
];

describe("OrdenesPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lista las órdenes del endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: ORDERS, ok: true }, 200));
    render(<OrdenesPage />);
    expect(await screen.findByText("ORD-001")).toBeInTheDocument();
    expect(screen.getByText("ORD-002")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/gestion/ordenes", expect.objectContaining({ cache: "no-store" }));
  });

  it("muestra error y reintenta la carga", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error("caída"));
    render(<OrdenesPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockResolvedValue(jsonResponse({ data: ORDERS, ok: true }, 200));
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("ORD-001")).toBeInTheDocument();
  });

  it("muestra el detalle al elegir una orden e imprime 2 copias sin secretos", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ data: ORDERS, ok: true }, 200));
    render(<OrdenesPage />);
    await user.click(await screen.findByText("ORD-001"));
    expect(await screen.findByRole("heading", { name: "Detalle de la orden" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Imprimir" }));
    const preview = await screen.findByRole("region", { name: "Vista previa de impresión" });
    expect(within(preview).getByText("Original")).toBeInTheDocument();
    expect(within(preview).getByText("Duplicado")).toBeInTheDocument();
    expect(within(preview).queryByText("no-mostrar")).toBeNull();
    expect(screen.queryByText("no-mostrar")).toBeNull();
  });

  it("muestra acceso denegado con enlace a login ante 401", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sesión requerida." }, ok: false }, 401)
    );
    render(<OrdenesPage />);
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });
});
