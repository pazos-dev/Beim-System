// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import VentasPage from "./page";

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
  { estado: "confirmada", id: "v_1", numero: "V-0001", total: 2500, version: 1 },
  { estado: "anulada", id: "v_2", numero: "V-0002", total: 1200, version: 2 }
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
    if (url.startsWith("/api/gestion/ventas")) {
      return options.list ? options.list() : listPayload();
    }
    if (url.startsWith("/api/gestion/auth/session")) {
      return jsonResponse(
        { data: { displayName: "Vendedor", role: options.role ?? "vendedor", username: "vendedor" }, ok: true },
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
        <VentasPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("VentasPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    useUiStore.setState({ ventaAnularModalId: null, ventaCreateModalOpen: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ ventaAnularModalId: null, ventaCreateModalOpen: false });
  });

  it("loads the list with the URL query and renders the table", async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    expect(screen.getByText("V-0002")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Número" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/ventas?page=1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("debounces the search into the URL and resets the page", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar ventas"), "V-0001");
    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/ventas?q=V-0001"));
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    stubRoutes({ list: () => Promise.reject(new Error("caída")) });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockClear();
    stubRoutes();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
  });

  it("shows an empty state without sales", async () => {
    stubRoutes({ list: () => Promise.resolve(listPayload({ items: [], totalItems: 0 })) });
    renderPage();
    expect(await screen.findByText("No hay ventas para mostrar.")).toBeInTheDocument();
  });

  it("shows access denied with a login link on 401", async () => {
    stubRoutes({ list: () => Promise.resolve(jsonResponse({ ok: false }, 401)) });
    renderPage();
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("hides creation for roles without write permission and anular for non-admins", async () => {
    stubRoutes({ role: "tecnico" });
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva venta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("shows creation but no anular action for vendedor", async () => {
    stubRoutes({ role: "vendedor" });
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva venta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
  });

  it("creates a sale, shows a toast, and refreshes the list", async () => {
    const user = userEvent.setup();
    let calls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/ventas" && init?.method === "POST") {
        return jsonResponse(
          { data: { estado: "confirmada", id: "v_3", numero: "V-0003", total: 2500, version: 1 }, ok: true },
          201
        );
      }
      if (url.startsWith("/api/gestion/ventas")) {
        calls += 1;
        return listPayload();
      }
      if (url.startsWith("/api/gestion/auth/session")) {
        return jsonResponse(
          { data: { displayName: "Vendedor", role: "vendedor", username: "vendedor" }, ok: true },
          200
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("V-0001")).toBeInTheDocument();
    const callsBefore = calls;

    await user.click(screen.getByRole("button", { name: "Nueva venta" }));
    await user.type(await screen.findByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "2");
    await user.type(screen.getByLabelText("Monto del pago"), "2500");
    await user.click(screen.getByRole("button", { name: "Crear venta" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Venta creada correctamente.");
    await waitFor(() => expect(calls).toBeGreaterThan(callsBefore));
  });

  it("annuls a sale with motivo and flips estado in place", async () => {
    const user = userEvent.setup();
    let anulada = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/ventas/v_1" && init?.method === "PATCH") {
        anulada = true;
        return jsonResponse(
          { data: { estado: "anulada", id: "v_1", numero: "V-0001", total: 2500, version: 2 }, ok: true },
          200
        );
      }
      if (url.startsWith("/api/gestion/ventas")) {
        return anulada
          ? listPayload({
              items: [
                { estado: "anulada", id: "v_1", numero: "V-0001", total: 2500, version: 2 },
                { estado: "anulada", id: "v_2", numero: "V-0002", total: 1200, version: 2 }
              ]
            })
          : listPayload();
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
    expect(await screen.findByText("V-0001")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await user.type(await screen.findByLabelText("Motivo"), "Error de facturación");
    await user.click(screen.getByRole("button", { name: "Anular venta" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Venta anulada correctamente.");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument());
  });
});
