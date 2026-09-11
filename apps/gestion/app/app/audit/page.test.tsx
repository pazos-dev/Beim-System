// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import AuditPage from "./page";
import type { ApiEnvelope, AuditEvent, AuditListResponse } from "../../../src/lib/api/audit-repository";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.search)
}));

const repositoryMock = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("../../../src/lib/api/audit-repository", () => ({
  auditRepository: repositoryMock,
}));

const authStoreMock = vi.hoisted(() => ({
  actor: { id: "u_1", name: "Admin", role: "administrador_principal", username: "admin" },
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

const EVENTS: AuditEvent[] = [
  {
    action: "venta.creada",
    actor: "u-admin",
    entity: "venta",
    id: "a_1",
    instant: "2026-09-08T10:00:00.000Z",
    result: "ok",
  },
  {
    action: "caja.abierta",
    actor: "u-caja",
    entity: "caja",
    id: "a_2",
    instant: "2026-09-08T09:00:00.000Z",
    result: "ok",
  },
];

function envelope<T>(data: T): ApiEnvelope<T> {
  return { ok: true, data };
}

function listResponse(overrides: Partial<AuditListResponse> = {}): ApiEnvelope<AuditListResponse> {
  return envelope<AuditListResponse>({
    items: EVENTS,
    limit: 50,
    page: 1,
    total: EVENTS.length,
    ...overrides,
  });
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <AuditPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("AuditPage", () => {
  beforeEach(() => {
    repositoryMock.list.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    authStoreMock.actor.role = "administrador_principal";
    useUiStore.setState({ period: { type: "month", value: "2026-09" } });
  });

  afterEach(() => {
    useUiStore.setState({ period: { type: "day", value: "" } });
  });

  it("loads the audit list with the period range and renders the rows", async () => {
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("venta.creada")).toBeInTheDocument();
    expect(screen.getByText("u-caja")).toBeInTheDocument();
    expect(repositoryMock.list).toHaveBeenCalledWith({
      action: undefined,
      actor: undefined,
      from: "2026-09-01",
      limit: 50,
      page: 1,
      to: "2026-09-30",
    });
  });

  it("hides the list from non-admin roles", async () => {
    authStoreMock.actor.role = "vendedor";
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("no tenés permiso");
    expect(repositoryMock.list).not.toHaveBeenCalled();
  });

  it("debounces text filters into the URL and resets the page", async () => {
    const user = userEvent.setup();
    repositoryMock.list.mockResolvedValue(listResponse());
    renderPage();

    expect(await screen.findByText("venta.creada")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Filtrar por actor"), "u-admin");

    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith(expect.stringContaining("actor=u-admin")));
  });

  it("shows access denied with a login link on authentication error", async () => {
    repositoryMock.list.mockResolvedValue({ error: { code: "AUTHENTICATION_REQUIRED" }, ok: false });
    renderPage();

    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
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

    expect(await screen.findByText("venta.creada")).toBeInTheDocument();
  });

  it("shows an empty state without events", async () => {
    repositoryMock.list.mockResolvedValue(listResponse({ items: [], total: 0 }));
    renderPage();

    expect(await screen.findByText("No hay eventos para los filtros seleccionados.")).toBeInTheDocument();
  });
});
