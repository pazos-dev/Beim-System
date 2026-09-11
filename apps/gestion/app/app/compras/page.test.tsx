// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { ToastProvider } from "../../../src/components/ui/Toast";
import ComprasPage from "./page";
import type { ApiEnvelope, Purchase, PurchaseListResponse } from "../../../src/lib/api/compra-repository";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.search),
}));

const repositoryMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../src/lib/api/compra-repository", () => ({
  compraRepository: repositoryMock,
}));

const authStoreMock = vi.hoisted(() => ({
  actor: { id: "u_1", name: "Admin", role: "administrador", username: "admin" },
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

const ITEMS: Purchase[] = [
  {
    id: "c_1",
    supplierName: "Proveedor Uno",
    data: {
      cantidad: 10,
      comprobante: "FAC-001",
      costoUnitario: 120,
      fecha: "2026-09-06T10:00:00.000Z",
      productoId: "p_1",
      total: 1200,
    },
  },
];

function envelope<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

function listResponse(overrides: Partial<PurchaseListResponse> = {}): ApiEnvelope<PurchaseListResponse> {
  return envelope<PurchaseListResponse>({
    items: ITEMS,
    limit: 25,
    page: 1,
    total: ITEMS.length,
    ...overrides,
  });
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ComprasPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  navigationState.replace.mockReset();
  navigationState.search = "";
  repositoryMock.list.mockReset();
  repositoryMock.create.mockReset();
  repositoryMock.update.mockReset();
  authStoreMock.actor.role = "administrador";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ComprasPage", () => {
  it("loads the list with the URL query and renders the table and entry form for an admin", async () => {
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("Proveedor Uno")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compras" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registrar compra" })).toBeInTheDocument();
    expect(repositoryMock.list).toHaveBeenCalledWith({ limit: 25, page: 1 });
  });

  it("syncs filter edits to the URL and resets the page", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("Proveedor Uno")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Filtrar por proveedor"), "Proveedor");

    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith("/app/compras?proveedor=Proveedor")
    );
  });

  it("registers an entry, shows a toast, and refreshes the list", async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    repositoryMock.list.mockImplementation(async () => {
      listCalls += 1;
      return listResponse();
    });
    repositoryMock.create.mockResolvedValue(
      envelope<Purchase>({
        data: { cantidad: 10, costoUnitario: 120, productoId: "p_1", total: 1200 },
        id: "c_2",
        supplierName: "Proveedor Uno",
      })
    );
    renderPage();

    expect(await screen.findByText("Proveedor Uno")).toBeInTheDocument();
    const callsBefore = listCalls;

    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "10");
    await user.type(screen.getByLabelText("Costo unitario"), "120");
    await user.type(screen.getByLabelText("Proveedor"), "Proveedor Uno");
    await user.click(screen.getByRole("button", { name: "Registrar compra" }));

    expect(repositoryMock.create).toHaveBeenCalledWith({
      supplierName: "Proveedor Uno",
      data: {
        productoId: "p_1",
        cantidad: 10,
        costoUnitario: 120,
        total: 1200,
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Compra registrada correctamente.");
    await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore));
  });

  it("gates the page for non-admin roles", async () => {
    authStoreMock.actor.role = "vendedor";
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    repositoryMock.list
      .mockResolvedValueOnce({ error: { code: "UNKNOWN_ERROR" }, ok: false })
      .mockResolvedValueOnce(listResponse());
    renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    repositoryMock.list.mockClear();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Proveedor Uno")).toBeInTheDocument();
  });

  it("shows an empty state without purchases", async () => {
    repositoryMock.list.mockResolvedValue(listResponse({ items: [], total: 0 }));
    renderPage();

    expect(await screen.findByText("No hay compras para mostrar.")).toBeInTheDocument();
  });

  it("shows access denied with a login link on authentication error", async () => {
    repositoryMock.list.mockResolvedValue({ error: { code: "AUTHENTICATION_REQUIRED" }, ok: false });
    renderPage();

    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute(
      "href",
      "/login"
    );
  });
});
