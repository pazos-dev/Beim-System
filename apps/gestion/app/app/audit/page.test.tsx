// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiSliceStore } from "../../../src/store/ui.slice";
import { ToastProvider } from "../../../src/components/ui/Toast";
import AuditPage from "./page";

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

const EVENTS = [
  {
    accion: "venta.creada",
    actorId: "u-admin",
    detalles: {},
    entidad: "venta",
    entidadId: "v_1",
    id: "a_1",
    instante: "2026-09-08T10:00:00.000Z",
    resultado: "ok"
  },
  {
    accion: "caja.abierta",
    actorId: "u-caja",
    detalles: {},
    entidad: "caja",
    entidadId: "sc_1",
    id: "a_2",
    instante: "2026-09-08T09:00:00.000Z",
    resultado: "ok"
  }
];

function stubRoutes(role = "administrador_principal"): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/audit")) {
      return jsonResponse({ data: { items: EVENTS, total: 2 }, ok: true }, 200);
    }
    if (url.startsWith("/api/gestion/auth/session")) {
      return jsonResponse(
        { data: { displayName: "Admin", role, username: "admin" }, ok: true },
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
        <AuditPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("AuditPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    useUiSliceStore.setState({ period: { type: "month", value: "2026-09" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiSliceStore.setState({ period: { type: "day", value: "" } });
  });

  it("loads the audit list with the period range and renders the rows", async () => {
    stubRoutes();
    renderPage();

    expect(await screen.findByText("venta.creada")).toBeInTheDocument();
    expect(screen.getByText("u-caja")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/audit?from=2026-09-01&to=2026-09-30&page=1",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("hides the list from non-admin roles", async () => {
    stubRoutes("vendedor");
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("no tenés permiso");
  });

  it("debounces text filters into the URL and resets the page", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();

    await screen.findByText("venta.creada");
    await user.type(screen.getByLabelText("Filtrar por actor"), "u-admin");
    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith(expect.stringContaining("actor=u-admin")));
  });

  it("shows access denied with a login link on 401", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.startsWith("/api/gestion/audit")) {
        return jsonResponse({ ok: false }, 401);
      }
      if (url.startsWith("/api/gestion/auth/session")) {
        return jsonResponse(
          { data: { displayName: "Admin", role: "administrador_principal", username: "admin" }, ok: true },
          200
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();

    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });
});
