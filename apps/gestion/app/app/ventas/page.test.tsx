// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import VentasPage from "./page";
import type { ApiEnvelope, Venta, VentaListResponse } from "../../../src/lib/api/venta-repository";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.search)
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

const ITEMS = [
  { estado: "confirmada", id: "v_1", numero: "V-0001", total: 2500, version: 1 },
  { estado: "anulada", id: "v_2", numero: "V-0002", total: 1200, version: 2 }
];

function envelope<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

function listResponse(overrides: Partial<VentaListResponse> = {}): ApiEnvelope<VentaListResponse> {
  return envelope<VentaListResponse>({ items: ITEMS, limit: 25, page: 1, total: ITEMS.length, ...overrides });
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <VentasPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("VentasPage", () => {
  beforeEach(() => {
    repositoryMock.list.mockReset();
    repositoryMock.create.mockReset();
    repositoryMock.annul.mockReset();
    repositoryMock.getById.mockReset();
    repositoryMock.nextNumber.mockReset();
    repositoryMock.createOrder.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    authStoreMock.actor.role = "vendedor";
    useUiStore.setState({ ventaAnularModalId: null, ventaCreateModalOpen: false });
  });

  afterEach(() => {
    useUiStore.setState({ ventaAnularModalId: null, ventaCreateModalOpen: false });
  });

  it("loads the list with the URL query and renders the table", async () => {
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    expect(screen.getByText("V-0002")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Número" })).toBeInTheDocument();
    expect(repositoryMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 25, type: "sale" })
    );
  });

  it("debounces the search into the URL and resets the page", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar ventas"), "V-0001");
    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/ventas?q=V-0001"));
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValueOnce({ error: { code: "UNKNOWN_ERROR" }, ok: false });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    repositoryMock.list.mockClear();
    repositoryMock.list.mockResolvedValue(listResponse());
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
  });

  it("shows an empty state without sales", async () => {
    repositoryMock.list.mockResolvedValue(listResponse({ items: [], total: 0 }));
    renderPage();
    expect(await screen.findByText("No hay ventas para mostrar.")).toBeInTheDocument();
  });

  it("shows access denied with a login link on authentication error", async () => {
    repositoryMock.list.mockResolvedValue({ error: { code: "AUTHENTICATION_REQUIRED" }, ok: false });
    renderPage();
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("hides creation for roles without write permission and anular for non-admins", async () => {
    authStoreMock.actor.role = "tecnico";
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva venta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("shows creation but no anular action for vendedor", async () => {
    authStoreMock.actor.role = "vendedor";
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva venta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("creates a sale, shows a toast, and refreshes the list", async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    repositoryMock.list.mockImplementation(async () => {
      listCalls += 1;
      return listResponse();
    });
    repositoryMock.create.mockResolvedValue(
      envelope<Venta>({ estado: "confirmada", id: "v_3", numero: "V-0003", total: 2500, version: 1 })
    );
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    const callsBefore = listCalls;

    await user.click(screen.getByRole("button", { name: "Nueva venta" }));
    await user.type(await screen.findByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "2");
    await user.type(screen.getByLabelText("Monto del pago"), "2500");
    await user.click(screen.getByRole("button", { name: "Crear venta" }));

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "walk-in",
        clientName: "Walk-in",
        items: [{ productId: "p_1", quantity: 2 }],
        payments: [{ amount: 2500, method: "efectivo" }],
      })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Venta creada correctamente.");
    await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore));
  });

  it("annuls a sale and refreshes the list", async () => {
    const user = userEvent.setup();
    authStoreMock.actor.role = "administrador";
    repositoryMock.list.mockResolvedValue(listResponse());
    repositoryMock.annul.mockResolvedValue({ ok: true, data: undefined });
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await user.type(await screen.findByLabelText("Motivo"), "Error de facturación");
    await user.click(screen.getByRole("button", { name: "Anular venta" }));

    expect(repositoryMock.annul).toHaveBeenCalledWith("v_1");
    expect(await screen.findByRole("status")).toHaveTextContent("Venta anulada correctamente.");
  });
});
