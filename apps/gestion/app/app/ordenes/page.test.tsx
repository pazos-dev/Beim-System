// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OrdenesPage from "./page";
import { renderWithQueryClient } from "../../../src/test/query-client";
import type { ApiEnvelope, Venta, VentaListResponse } from "../../../src/lib/api/venta-repository";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams("estado=en_diagnostico")
}));

const repositoryMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  annul: vi.fn(),
  getById: vi.fn(),
  nextNumber: vi.fn(),
  createOrder: vi.fn(),
}));

vi.mock("../../../src/lib/api/venta-repository", () => ({
  ventaRepository: repositoryMock,
}));

const authStoreMock = vi.hoisted(() => ({
  actor: { id: "u_1", name: "Vendedor", role: "vendedor", username: "vendedor" },
  token: "test-token",
}));

vi.mock("../../../src/lib/api/auth-store", () => ({
  useAuthStore: Object.assign(
    (selector?: (state: unknown) => unknown) => (selector ? selector(authStoreMock) : authStoreMock),
    {
      getState: () => authStoreMock,
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    }
  ),
  useAuthToken: () => authStoreMock.token,
  useIsAuthenticated: () => true,
  useActor: () => authStoreMock.actor,
}));

const PAYLOAD = {
  items: [
    {
      clienteId: "cli-1",
      clienteNombre: "Cliente Uno",
      equipment: "Samsung A54",
      estado: "en_diagnostico",
      estimatedDisplay: "90 min",
      id: "ord-1",
      numero: "ORD-001",
      paymentStatus: "pendiente",
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
      paymentStatus: "pagado",
      total: 2500,
      version: 1
    }
  ],
  limit: 25,
  page: 1,
  total: 2
};

function envelope<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

function ordersResponse(overrides: Partial<VentaListResponse> = {}): ApiEnvelope<VentaListResponse> {
  return envelope<VentaListResponse>({ ...PAYLOAD, ...overrides });
}

describe("OrdenesPage", () => {
  beforeEach(() => {
    repositoryMock.list.mockReset();
    repositoryMock.create.mockReset();
    repositoryMock.annul.mockReset();
    repositoryMock.getById.mockReset();
    repositoryMock.nextNumber.mockReset();
    repositoryMock.createOrder.mockReset();
    replaceMock.mockReset();
    authStoreMock.actor.role = "vendedor";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carga la lista enriquecida con filtro por defecto en la URL", async () => {
    repositoryMock.list.mockResolvedValue(ordersResponse());
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByText("ORD-001")).toBeInTheDocument();
    expect(screen.getByText("Cliente Uno")).toBeInTheDocument();
    expect(screen.getByText("Samsung A54")).toBeInTheDocument();
    expect(repositoryMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 25, status: "en_diagnostico", type: "order" })
    );
  });

  it("muestra error y reintenta la carga", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValueOnce({ error: { code: "UNKNOWN_ERROR" }, ok: false });
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    repositoryMock.list.mockClear();
    repositoryMock.list.mockResolvedValue(ordersResponse());
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("ORD-001")).toBeInTheDocument();
  });

  it("imprime 2 copias sin secretos al elegir una orden", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValue(ordersResponse());
    renderWithQueryClient(<OrdenesPage />);
    await user.click(await screen.findByText("ORD-001"));
    await user.click(screen.getByRole("button", { name: "Imprimir" }));
    const preview = await screen.findByRole("region", { name: "Vista previa de impresión" });
    expect(within(preview).getByText("Original")).toBeInTheDocument();
    expect(within(preview).getByText("Duplicado")).toBeInTheDocument();
  });

  it("muestra acceso denegado con enlace a login ante error de autenticación", async () => {
    repositoryMock.list.mockResolvedValue({ error: { code: "AUTHENTICATION_REQUIRED" }, ok: false });
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("cambia el filtro activo y refleja la selección en la URL", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValue(ordersResponse());
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByRole("button", { name: /En diagnóstico/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await user.click(screen.getByRole("button", { name: /Presupuesto/ }));
    expect(replaceMock).toHaveBeenCalledWith("/app/ordenes?estado=presupuesto");
  });

  it("muestra la columna de boleta para administradores", async () => {
    authStoreMock.actor.role = "administrador";
    repositoryMock.list.mockResolvedValue(
      ordersResponse({
        items: [
          {
            ...PAYLOAD.items[0],
            boletaNumero: "B-001",
          } as unknown as Venta,
        ],
      })
    );
    renderWithQueryClient(<OrdenesPage />);
    expect(await screen.findByText("ORD-001")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Boleta" })).toBeInTheDocument();
    expect(screen.getByText("B-001")).toBeInTheDocument();
  });
});
