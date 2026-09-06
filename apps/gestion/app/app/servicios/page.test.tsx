// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import ServiciosPage from "./page";

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
  { active: true, displayName: "Soporte técnico", id: "s_1", price: 1500, version: 1 },
  { active: true, displayName: "Instalación", id: "s_2", price: 3200, version: 2 }
];

function listPayload(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(
    { data: { items: ITEMS, page: 1, pageSize: 25, totalItems: 2, ...overrides }, ok: true },
    200
  );
}

function stubRoutes(options: { list?: () => Promise<Response>; role?: string; sessionOk?: boolean } = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/servicios")) {
      return options.list ? options.list() : listPayload();
    }
    if (url.startsWith("/api/gestion/auth/session")) {
      if (options.sessionOk === false) {
        return jsonResponse(
          { error: { code: "AUTHENTICATION_REQUIRED", message: "Sesión requerida." }, ok: false },
          401
        );
      }
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
        <ServiciosPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function resetUiStore(): void {
  useUiStore.setState({
    servicioCreateOpen: false,
    servicioDeactivating: null,
    servicioEditing: null
  });
}

describe("ServiciosPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    resetUiStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetUiStore();
  });

  it("loads the list with the URL query and renders the table", async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    expect(screen.getByText("Instalación")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nombre del servicio" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Precio" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/servicios?active=true&page=1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("debounces the search into the URL and resets the page", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar servicios"), "tecnica");
    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/servicios?q=tecnica"));
  });

  it("syncs the active filter into the URL", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filtrar por estado"), "false");
    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith("/app/servicios?active=false")
    );
  });

  it("paginates through the URL", async () => {
    const user = userEvent.setup();
    stubRoutes({ list: () => Promise.resolve(listPayload({ items: ITEMS, totalItems: 30 })) });
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith("/app/servicios?page=2")
    );
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    stubRoutes({ list: () => Promise.reject(new Error("caída")) });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockClear();
    stubRoutes();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
  });

  it("shows an empty state without services", async () => {
    stubRoutes({ list: () => Promise.resolve(listPayload({ items: [], totalItems: 0 })) });
    renderPage();
    expect(await screen.findByText("No hay servicios para mostrar.")).toBeInTheDocument();
  });

  it("shows access denied with a login link on 401", async () => {
    stubRoutes({ list: () => Promise.resolve(jsonResponse({ ok: false }, 401)) });
    renderPage();
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("hides creation and row management for roles without write permission", async () => {
    stubRoutes({ role: "tecnico" });
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo servicio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });

  it("creates a service, shows a toast, and refreshes the list", async () => {
    const user = userEvent.setup();
    let calls = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/servicios" && init?.method === "POST") {
        const key = (init.headers as Record<string, string>)["x-idempotency-key"];
        expect(typeof key).toBe("string");
        return jsonResponse(
          {
            data: { active: true, displayName: "Mantenimiento", id: "s_3", price: 2100, version: 0 },
            ok: true
          },
          201
        );
      }
      if (url.startsWith("/api/gestion/servicios")) {
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
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    const callsBefore = calls;

    await user.click(screen.getByRole("button", { name: "Nuevo servicio" }));
    await user.type(await screen.findByLabelText("Nombre del servicio"), "Mantenimiento");
    await user.type(screen.getByLabelText("Precio"), "2100");
    await user.click(screen.getByRole("button", { name: "Crear servicio" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Servicio creado correctamente.");
    await waitFor(() => expect(calls).toBeGreaterThan(callsBefore));
  });

  it("blocks creation with a validation error and no POST", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nuevo servicio" }));
    await user.click(await screen.findByRole("button", { name: "Crear servicio" }));

    expect(await screen.findByText("Ingresá el nombre del servicio.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/gestion/servicios",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("edits a service with its version and shows a toast", async () => {
    const user = userEvent.setup();
    let patched: unknown = null;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/servicios/s_1" && init?.method === "PATCH") {
        patched = JSON.parse(String(init.body));
        const key = (init.headers as Record<string, string>)["x-idempotency-key"];
        expect(typeof key).toBe("string");
        return jsonResponse(
          {
            data: { active: true, displayName: "Soporte prioritario", id: "s_1", price: 1800, version: 2 },
            ok: true
          },
          200
        );
      }
      if (url.startsWith("/api/gestion/servicios")) return listPayload();
      if (url.startsWith("/api/gestion/auth/session")) {
        return jsonResponse(
          { data: { displayName: "Admin", role: "administrador", username: "admin" }, ok: true },
          200
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();

    const row = screen.getByText("Soporte técnico").closest("tr");
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Editar" }));

    const nameInput = await screen.findByLabelText("Nombre del servicio");
    expect(nameInput).toHaveValue("Soporte técnico");
    await user.clear(nameInput);
    await user.type(nameInput, "Soporte prioritario");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Servicio actualizado correctamente.");
    expect(patched).toMatchObject({ displayName: "Soporte prioritario", expectedVersion: 1 });
  });

  it("deactivates a service through confirmation and it leaves the list", async () => {
    const user = userEvent.setup();
    const single = [{ active: true, displayName: "Soporte técnico", id: "s_1", price: 1500, version: 1 }];
    let deactivated = false;
    let patched: unknown = null;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/gestion/servicios/s_1" && init?.method === "PATCH") {
        patched = JSON.parse(String(init.body));
        deactivated = true;
        return jsonResponse(
          {
            data: { active: false, displayName: "Soporte técnico", id: "s_1", price: 1500, version: 2 },
            ok: true
          },
          200
        );
      }
      if (url.startsWith("/api/gestion/servicios")) {
        return listPayload({ items: deactivated ? [] : single, totalItems: deactivated ? 0 : 1 });
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
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Desactivar" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Soporte técnico");
    await user.click(within(dialog).getByRole("button", { name: "Desactivar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Servicio desactivado correctamente.");
    expect(patched).toMatchObject({ active: false, expectedVersion: 1 });
    await waitFor(() => expect(screen.queryByText("Soporte técnico")).not.toBeInTheDocument());
  });
});
