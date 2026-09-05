// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrdenesPage from "./page";
import { renderWithQueryClient } from "../../../src/test/query-client";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams("estado=en_diagnostico")
}));

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

const PAYLOAD = {
  canViewBoleta: false,
  counts: { todas: 2, abiertas: 2, en_diagnostico: 1, canceladas: 0 },
  items: [
    {
      clienteId: "cli-1",
      clienteNombre: "Cliente Uno",
      equipment: "Samsung A54",
      estado: "en_diagnostico",
      estimatedDisplay: "90 min",
      id: "ord-1",
      numero: "ORD-001",
      ownerId: "u-1",
      paymentStatus: "pendiente",
      secreto: "no-mostrar",
      total: 1500,
      version: 1
    },
    {
      clienteId: "cli-2",
      clienteNombre: "Cliente Dos",
      equipment: "—",
      estado: "aprobado",
      estimatedDisplay: "2 h",
      id: "ord-2",
      numero: "ORD-002",
      ownerId: "u-1",
      paymentStatus: "pagado",
      total: 2500,
      version: 1
    }
  ],
  page: 1,
  pageSize: 25,
  totalItems: 2
};

const SESSION = { data: { displayName: "Vendedor", role: "vendedor", username: "vendedor" }, ok: true };

function ordersPayload(overrides: Partial<typeof PAYLOAD> = {}): Response {
  return jsonResponse({ ok: true, data: { ...PAYLOAD, ...overrides } }, 200);
}

function stubRoutes(options: { orders?: () => Promise<Response>; session?: boolean } = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/ordenes")) {
      return options.orders ? options.orders() : ordersPayload();
    }
    if (url.startsWith("/api/gestion/auth/session")) {
      return options.session === false
        ? jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sesión requerida." }, ok: false }, 401)
        : jsonResponse(SESSION, 200);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("OrdenesPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    replaceMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carga la lista enriquecida con filtro por defecto en la URL", async () => {
    stubRoutes();
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByText("ORD-001")).toBeInTheDocument();
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("Samsung A54")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/ordenes?dir=asc&estado=en_diagnostico&page=1&sort=numero",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("muestra error y reintenta la carga", async () => {
    const user = userEvent.setup();
    stubRoutes({ orders: () => Promise.reject(new Error("caída")) });
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockClear();
    stubRoutes();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("ORD-001")).toBeInTheDocument();
  });

  it("imprime 2 copias sin secretos al elegir una orden", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderWithQueryClient(<OrdenesPage />);
    await user.click(await screen.findByText("ORD-001"));
    await user.click(screen.getByRole("button", { name: "Imprimir" }));
    const preview = await screen.findByRole("region", { name: "Vista previa de impresión" });
    expect(within(preview).getByText("Original")).toBeInTheDocument();
    expect(within(preview).getByText("Duplicado")).toBeInTheDocument();
    expect(within(preview).queryByText("no-mostrar")).toBeNull();
    expect(screen.queryByText("no-mostrar")).toBeNull();
  });

  it("muestra acceso denegado con enlace a login ante 401", async () => {
    stubRoutes({ orders: () => Promise.resolve(jsonResponse({ ok: false }, 401)) });
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("cambia el filtro activo y refleja la selección en la URL", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByRole("button", { name: /En diagnóstico/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(screen.getByRole("button", { name: /Presupuesto/ }));
    expect(replaceMock).toHaveBeenCalledWith("/app/ordenes?estado=presupuesto");
  });
});