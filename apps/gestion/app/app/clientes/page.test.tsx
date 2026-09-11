// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import ClientesPage from "./page";
import type { ApiEnvelope, Cliente, ClienteListResponse } from "../../../src/lib/api/cliente-repository";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.search)
}));

const repositoryMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../src/lib/api/cliente-repository", () => ({
  clienteRepository: repositoryMock,
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

const ITEMS: Cliente[] = [
  { active: true, email: "maria@example.com", id: "c_1", name: "María Gómez", phone: "1112345678" },
  { active: false, id: "c_2", name: "Juan Pérez" },
];

function envelope<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

function listResponse(overrides: Partial<ClienteListResponse> = {}): ApiEnvelope<ClienteListResponse> {
  return envelope<ClienteListResponse>({ items: ITEMS, limit: 25, page: 1, total: ITEMS.length, ...overrides });
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
    repositoryMock.list.mockReset();
    repositoryMock.create.mockReset();
    repositoryMock.update.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    authStoreMock.actor.role = "vendedor";
    useUiStore.setState({ clienteModalOpen: false, duplicateWarning: null });
  });

  afterEach(() => {
    useUiStore.setState({ clienteModalOpen: false, duplicateWarning: null });
  });

  it("loads the list with the URL query and renders the table", async () => {
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nombre del cliente" })).toBeInTheDocument();
    expect(repositoryMock.list).toHaveBeenCalledWith({ active: "true", limit: 25, page: 1, search: "" });
  });

  it("debounces the search into the URL and resets the page", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Buscar clientes"), "maria");

    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/clientes?q=maria"));
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

    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
  });

  it("shows an empty state without clients", async () => {
    repositoryMock.list.mockResolvedValue(listResponse({ items: [], total: 0 }));
    renderPage();

    expect(await screen.findByText("No hay clientes para mostrar.")).toBeInTheDocument();
  });

  it("shows access denied with a login link on authentication error", async () => {
    repositoryMock.list.mockResolvedValue({ error: { code: "AUTHENTICATION_REQUIRED" }, ok: false });
    renderPage();

    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });

  it("hides creation for roles without write permission", async () => {
    authStoreMock.actor.role = "tecnico";
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuevo cliente" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver órdenes" })).not.toBeInTheDocument();
  });

  it("creates a client, shows a toast, and refreshes the list", async () => {
    const user = userEvent.setup();
    let listCalls = 0;
    repositoryMock.list.mockImplementation(async () => {
      listCalls += 1;
      return listResponse();
    });
    repositoryMock.create.mockResolvedValue(
      envelope<Cliente>({ active: true, id: "c_3", name: "Ana Ruiz" })
    );
    renderPage();

    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    const callsBefore = listCalls;

    await user.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    await user.type(await screen.findByLabelText("Nombre del cliente"), "Ana Ruiz");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(repositoryMock.create).toHaveBeenCalledWith({ name: "Ana Ruiz" });
    expect(await screen.findByRole("status")).toHaveTextContent("Cliente creado correctamente.");
    await waitFor(() => expect(listCalls).toBeGreaterThan(callsBefore));
  });

  it("shows a blocking duplicate warning that requires acknowledgment", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValue(listResponse());
    repositoryMock.create.mockResolvedValue(
      envelope<Cliente & { duplicateWarning: "email" }>({
        active: true,
        duplicateWarning: "email",
        email: "maria@example.com",
        id: "c_3",
        name: "Ana Ruiz",
      })
    );
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
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("María Gómez")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Ver órdenes" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/app/ordenes");
    }
  });
});
