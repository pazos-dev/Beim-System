// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import StockPage from "./page";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.search)
}));

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

const ITEMS = [
  {
    balance: 3,
    deposito: "taller",
    displayName: "Filtro de aceite",
    lowStock: true,
    minimum: 5,
    productoId: "p_1"
  },
  {
    balance: 20,
    deposito: "principal",
    displayName: "Bujía",
    lowStock: false,
    minimum: 5,
    productoId: "p_2"
  }
];

function listPayload(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(
    { data: { items: ITEMS, page: 1, pageSize: 25, totalItems: 2, ...overrides }, ok: true },
    200
  );
}

function stubRoutes(options: { list?: () => Promise<Response>; role?: string } = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/stock")) {
      return options.list ? options.list() : listPayload();
    }
    if (url.startsWith("/api/gestion/auth/session")) {
      return jsonResponse(
        {
          data: { displayName: "Admin", role: options.role ?? "administrador", username: "admin" },
          ok: true
        },
        200
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
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
    vi.stubGlobal("fetch", fetchMock);
    useUiStore.setState({
      purchaseModalOpen: false,
      stockMovementModalOpen: false,
      stockTransferModalOpen: false
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({
      purchaseModalOpen: false,
      stockMovementModalOpen: false,
      stockTransferModalOpen: false
    });
  });

  it("loads the levels list with the URL query and renders the table", async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText("Filtro de aceite")).toBeInTheDocument();
    expect(screen.getByText("Bajo stock")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/stock?page=1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("debounces the productoId filter into the URL and resets the page", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();
    expect(await screen.findByText("Filtro de aceite")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Filtrar por producto"), "p_1");
    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/stock?productoId=p_1"));
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    stubRoutes({ list: () => Promise.reject(new Error("caída")) });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockClear();
    stubRoutes();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Filtro de aceite")).toBeInTheDocument();
  });

  it("shows an empty state without levels", async () => {
    stubRoutes({ list: () => Promise.resolve(listPayload({ items: [], totalItems: 0 })) });
    renderPage();
    expect(await screen.findByText("No hay stock para mostrar.")).toBeInTheDocument();
  });

  it("transfers as admin, shows a toast, and refreshes the list", async () => {
    const user = userEvent.setup();
    let calls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/stock/transferencias" && init?.method === "POST") {
        return jsonResponse({ data: { referencia: "t_1" }, ok: true }, 201);
      }
      if (url.startsWith("/api/gestion/stock")) {
        calls += 1;
        return listPayload();
      }
      if (url.startsWith("/api/gestion/auth/session")) {
        return jsonResponse(
          { data: { displayName: "Admin", role: "administrador", username: "admin" }, ok: true },
          200
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("Filtro de aceite")).toBeInTheDocument();
    const callsBefore = calls;

    await user.click(screen.getByRole("button", { name: "Transferir" }));
    await user.type(await screen.findByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "2");
    await user.selectOptions(screen.getByLabelText("Destino"), "taller");
    await user.click(screen.getByRole("button", { name: "Transferir stock" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Transferencia registrada correctamente.");
    await waitFor(() => expect(calls).toBeGreaterThan(callsBefore));
  });

  it("hides admin actions for non-admin roles", async () => {
    stubRoutes({ role: "vendedor" });
    renderPage();
    expect(await screen.findByText("Filtro de aceite")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transferir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
  });
});
