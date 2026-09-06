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
});
