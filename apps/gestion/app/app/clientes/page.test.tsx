// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { isRole } from "../../../src/kernel/role";
import { useSessionStore } from "../../../src/store/session.slice";
import { useUiSliceStore } from "../../../src/store/ui.slice";
import { ToastProvider } from "../../../src/components/ui/Toast";
import ClientesPage from "./page";

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
    active: true,
    displayName: "María Gómez",
    document: "30123456",
    email: "maria@example.com",
    id: "c_1",
    phone: "1112345678",
    version: 1
  },
  { active: false, displayName: "Juan Pérez", id: "c_2", version: 2 }
];

function listPayload(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(
    { data: { items: ITEMS, page: 1, pageSize: 25, totalItems: 2, ...overrides }, ok: true },
    200
  );
}

// Pages read the session role from the canonical store (no page-level
// session fetch), so tests seed the actor directly instead of stubbing
// the session endpoint.
function seedSessionActor(role: string | null): void {
  useSessionStore.setState({
    actor: role !== null && isRole(role)
      ? { displayName: "Test", id: "u-test", role, username: "test" }
      : null
  });
}

function stubRoutes(options: { list?: () => Promise<Response>; role?: string; sessionOk?: boolean } = {}): void {
  seedSessionActor(options.sessionOk === false ? null : (options.role ?? "vendedor"));
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/clientes")) {
      return options.list ? options.list() : listPayload();
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ClientesPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("ClientesPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    seedSessionActor(null);
    useUiSliceStore.setState({ clienteModalOpen: false, duplicateWarning: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiSliceStore.setState({ clienteModalOpen: false, duplicateWarning: null });
  });

  it("loads the list with the URL query and renders the table", async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nombre del cliente" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/clientes?active=true&page=1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("debounces the search into the URL and resets the page", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();
    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar clientes"), "maria");
    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/clientes?q=maria"));
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    stubRoutes({ list: () => Promise.reject(new Error("caída")) });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockClear();
    stubRoutes();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
  });

  it("shows an empty state without clients", async () => {
    stubRoutes({ list: () => Promise.resolve(listPayload({ items: [], totalItems: 0 })) });
    renderPage();
    expect(await screen.findByText("No hay clientes para mostrar.")).toBeInTheDocument();
  });

  it("shows access denied with a login link on 401", async () => {
    stubRoutes({ list: () => Promise.resolve(jsonResponse({ ok: false }, 401)) });
    renderPage();
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("hides creation for roles without write permission", async () => {
    stubRoutes({ role: "tecnico" });
    renderPage();
    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver órdenes" })).not.toBeInTheDocument();
  });

  it("creates a client, shows a toast, and refreshes the list", async () => {
    const user = userEvent.setup();
    let calls = 0;
    stubRoutes({
      list: () => {
        calls += 1;
        return Promise.resolve(listPayload());
      }
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/clientes" && init?.method === "POST") {
        return jsonResponse(
          { data: { cliente: { active: true, displayName: "Ana Ruiz", id: "c_3", version: 1 } }, ok: true },
          201
        );
      }
      if (url.startsWith("/api/gestion/clientes")) {
        calls += 1;
        return listPayload();
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    seedSessionActor("vendedor");
    renderPage();
    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    const callsBefore = calls;

    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    await user.type(await screen.findByLabelText("Nombre del cliente"), "Ana Ruiz");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cliente creado correctamente.");
    await waitFor(() => expect(calls).toBeGreaterThan(callsBefore));
  });

  it("shows a blocking duplicate warning that requires acknowledgment", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/clientes" && init?.method === "POST") {
        return jsonResponse(
          {
            data: {
              cliente: { active: true, displayName: "Ana Ruiz", email: "maria@example.com", id: "c_3", version: 1 },
              duplicateWarning: "email"
            },
            ok: true
          },
          201
        );
      }
      if (url.startsWith("/api/gestion/clientes")) return listPayload();
      throw new Error(`Unexpected fetch: ${url}`);
    });
    seedSessionActor("vendedor");
    renderPage();
    expect(await screen.findByText("María Gómez")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    await user.type(await screen.findByLabelText("Nombre del cliente"), "Ana Ruiz");
    await user.type(screen.getByLabelText("Correo electrónico"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("correo electrónico");
    await user.click(screen.getByRole("button", { name: "Entendido" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("links each row to the orders module for navigation only", async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Ver órdenes" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/app/ordenes");
    }
  });
});
