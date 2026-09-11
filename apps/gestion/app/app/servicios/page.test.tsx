// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useAuthStore } from "../../../src/lib/api/auth-store";
import { setAuthToken } from "../../../src/lib/api-config";
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

const THIRTY_ITEMS = [
  { active: true, displayName: "Soporte técnico", id: "s_1", price: 1500, version: 1 },
  ...Array.from({ length: 29 }, (_, i) => ({
    active: true,
    displayName: `Servicio ${i + 2}`,
    id: `s_${i + 2}`,
    price: 1000,
    version: 1
  }))
];

function listResponse(items: unknown[] = ITEMS): Response {
  return jsonResponse({ data: items, ok: true }, 200);
}

function setActor(role: string): void {
  useAuthStore.setState({
    actor: { id: "u-1", name: "Test", role, username: "test" },
    token: "tok"
  });
}

function stubFetch(): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url === "http://localhost:4000/api/v1/services" || url.startsWith("http://localhost:4000/api/v1/services?")) {
      return listResponse();
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
    setAuthToken("tok");
    setActor("administrador");
    resetUiStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAuthToken("");
    useAuthStore.setState({ actor: null, token: null });
    resetUiStore();
  });

  it("loads the list with the URL query and renders the table", async () => {
    stubFetch();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    expect(screen.getByText("Instalación")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nombre del servicio" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Precio" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estado" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/services",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("debounces the search into the URL and resets the page", async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar servicios"), "tecnica");
    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/servicios?q=tecnica"));
  });

  it("syncs the active filter into the URL", async () => {
    const user = userEvent.setup();
    stubFetch();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Filtrar por estado"), "false");
    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith("/app/servicios?active=false")
    );
  });

  it("paginates through the URL", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url === "http://localhost:4000/api/v1/services" || url.startsWith("http://localhost:4000/api/v1/services?")) {
        return listResponse(THIRTY_ITEMS);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith("/app/servicios?page=2")
    );
  });

  it("shows error and retries the load", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url === "http://localhost:4000/api/v1/services" || url.startsWith("http://localhost:4000/api/v1/services?")) {
        return Promise.reject(new Error("caída"));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fetchMock.mockClear();
    stubFetch();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();
  });

  it("shows an empty state without services", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url === "http://localhost:4000/api/v1/services" || url.startsWith("http://localhost:4000/api/v1/services?")) {
        return listResponse([]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("No hay servicios para mostrar.")).toBeInTheDocument();
  });

  it("shows access denied with a login link on 401", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url === "http://localhost:4000/api/v1/services" || url.startsWith("http://localhost:4000/api/v1/services?")) {
        return jsonResponse({ error: { code: "AUTHENTICATION_REQUIRED", message: "Sesión requerida." }, ok: false }, 401);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("hides creation and row management for roles without write permission", async () => {
    stubFetch();
    useAuthStore.setState({
      actor: { id: "u-1", name: "Test", role: "tecnico", username: "test" },
      token: "tok"
    });
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
      if (url === "http://localhost:4000/api/v1/services" && init?.method === "POST") {
        return jsonResponse(
          {
            data: { active: true, displayName: "Mantenimiento", id: "s_3", price: 2100, version: 0 },
            ok: true
          },
          201
        );
      }
      if (url === "http://localhost:4000/api/v1/services" && (init?.method ?? "GET") === "GET") {
        calls += 1;
        return listResponse();
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
    stubFetch();
    renderPage();
    expect(await screen.findByText("Soporte técnico")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nuevo servicio" }));
    await user.click(await screen.findByRole("button", { name: "Crear servicio" }));

    expect(await screen.findByText("Ingresá el nombre del servicio.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/services",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("edits a service with its version and shows a toast", async () => {
    const user = userEvent.setup();
    let patched: unknown = null;
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "http://localhost:4000/api/v1/services/s_1" && init?.method === "PATCH") {
        patched = JSON.parse(String(init.body));
        return jsonResponse(
          {
            data: { active: true, displayName: "Soporte prioritario", id: "s_1", price: 1800, version: 2 },
            ok: true
          },
          200
        );
      }
      if (url === "http://localhost:4000/api/v1/services" && (init?.method ?? "GET") === "GET") {
        return listResponse();
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
      if (url === "http://localhost:4000/api/v1/services/s_1" && init?.method === "PATCH") {
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
      if (url === "http://localhost:4000/api/v1/services" && (init?.method ?? "GET") === "GET") {
        return listResponse(deactivated ? [] : single);
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
