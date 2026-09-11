// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import { useActor } from "../../../src/lib/api/auth-store";
import StockPage from "./page";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));
const mockActor = vi.hoisted(() =>
  vi.fn(() => ({ id: "u_1", name: "Admin", role: "administrador", username: "admin" }))
);
const searchParamsCache = vi.hoisted(() => ({
  current: new URLSearchParams(""),
  lastSearch: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => {
    if (navigationState.search !== searchParamsCache.lastSearch) {
      searchParamsCache.current = new URLSearchParams(navigationState.search);
      searchParamsCache.lastSearch = navigationState.search;
    }
    return searchParamsCache.current;
  },
}));

vi.mock("../../../src/lib/api/auth-store", () => ({
  useActor: () => mockActor(),
  useAuthStore: Object.assign(
    () => ({}),
    {
      getState: () => ({ token: "test-token" }),
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    }
  ),
}));

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const ITEMS = [
  {
    id: "sm_1",
    productId: "p_1",
    movementType: "salida",
    quantity: 2,
    detail: "venta",
    createdAt: "2026-01-10T12:00:00.000Z",
  },
  {
    id: "sm_2",
    productId: "p_2",
    movementType: "entrada",
    quantity: 10,
    detail: "compra",
    createdAt: "2026-01-11T12:00:00.000Z",
  },
];

function listPayload(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(
    { data: { items: ITEMS, limit: 25, page: 1, total: 2, ...overrides }, ok: true },
    200
  );
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <StockPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("StockPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    searchParamsCache.current = new URLSearchParams("");
    searchParamsCache.lastSearch = "";
    vi.stubGlobal("fetch", fetchMock);
    useUiStore.setState({
      purchaseModalOpen: false,
      stockMovementModalOpen: false,
      stockTransferModalOpen: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockActor.mockReturnValue({
      id: "u_1",
      name: "Admin",
      role: "administrador",
      username: "admin",
    });
    useUiStore.setState({
      purchaseModalOpen: false,
      stockMovementModalOpen: false,
      stockTransferModalOpen: false,
    });
  });

  it("loads the movements list with the URL query and renders the table", async () => {
    fetchMock.mockResolvedValue(listPayload());
    navigationState.search = "?productoId=p_1";
    renderPage();

    expect(await screen.findByText("p_1")).toBeInTheDocument();
    expect(screen.getByText("Salida")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/stock-movements?productId=p_1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
  });

  it("debounces the productoId filter into the URL", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(listPayload());
    renderPage();

    expect(await screen.findByText("p_1")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Filtrar por producto"), "p_2");

    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith("/app/stock?productoId=p_2")
    );
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error("caída"));
    renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(listPayload());

    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("p_1")).toBeInTheDocument();
  });

  it("shows an empty state without movements", async () => {
    fetchMock.mockResolvedValue(listPayload({ items: [], total: 0 }));
    renderPage();

    expect(await screen.findByText("No hay movimientos para mostrar.")).toBeInTheDocument();
  });

  it("hides admin actions for non-admin roles", async () => {
    mockActor.mockReturnValue({ id: "u_2", name: "Vendedor", role: "vendedor", username: "vendedor" });
    fetchMock.mockResolvedValue(listPayload());
    renderPage();

    expect(await screen.findByText("p_1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transferir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
  });
});
