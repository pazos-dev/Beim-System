// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import CajaPage from "./page";

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

const CLOSED_ESTADO = {
  abierta: false,
  esperado: 0,
  gastosDia: { count: 0, total: 0 },
  porMetodo: [],
  sesion: null
};

const OPEN_ESTADO = {
  abierta: true,
  esperado: 900,
  gastosDia: { count: 0, total: 0 },
  porMetodo: [{ metodo: "efectivo", total: 0 }],
  sesion: {
    apertura: 1000,
    contado: 0,
    diferencia: 0,
    esperado: 900,
    estado: "abierta",
    fecha: "2026-04-01",
    id: "sc_1",
    ownerId: "u-caja",
    version: 1
  }
};

const CLOSED_SESSION = {
  ...OPEN_ESTADO.sesion,
  contado: 1150,
  diferencia: 250,
  esperado: 900,
  estado: "cerrada",
  version: 2
};

interface StubOptions {
  estados?: () => Promise<Response>;
  post?: (url: string, init?: RequestInit) => Promise<Response>;
  role?: string;
}

function stubRoutes(options: StubOptions = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/caja")) {
      if (init?.method === "POST" && options.post) return options.post(url, init);
      if (init?.method === "POST") return jsonResponse({ data: CLOSED_SESSION, ok: true }, 200);
      return options.estados ? options.estados() : jsonResponse({ data: CLOSED_ESTADO, ok: true }, 200);
    }
    if (url.startsWith("/api/gestion/auth/session")) {
      return jsonResponse(
        { data: { displayName: "Caja", role: options.role ?? "caja", username: "caja" }, ok: true },
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
        <CajaPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function postHeaders(): Headers[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => new Headers((init as RequestInit)?.headers));
}

describe("CajaPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    useUiStore.setState({ cajaFormRevision: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ cajaFormRevision: 0 });
  });

  it("shows the closed banner and the open form when no session is open", async () => {
    stubRoutes();
    renderPage();
    expect(await screen.findByText("No hay una caja abierta.")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Apertura inicial")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contado")).not.toBeInTheDocument();
  });

  it("opens a session, flips the banner, and toasts", async () => {
    const user = userEvent.setup();
    let open = false;
    stubRoutes({
      estados: () => Promise.resolve(jsonResponse({ data: open ? OPEN_ESTADO : CLOSED_ESTADO, ok: true }, 200))
    });
    renderPage();
    expect(await screen.findByText("No hay una caja abierta.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Fecha"), "2026-04-01");
    await user.type(screen.getByLabelText("Apertura inicial"), "1000");
    open = true;
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));
    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    expect(await screen.findByText("Caja abierta con éxito.")).toBeInTheDocument();
    const [post] = postHeaders();
    expect(post.get("x-idempotency-key")).toBeTruthy();
  });

  it("sends a fresh idempotency key per attempt", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    stubRoutes({
      post: () => {
        attempt += 1;
        return Promise.resolve(jsonResponse({ data: CLOSED_SESSION, ok: true }, 200));
      }
    });
    renderPage();
    expect(await screen.findByLabelText("Fecha")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Fecha"), "2026-04-01");
    await user.type(screen.getByLabelText("Apertura inicial"), "1000");
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));
    await waitFor(() => expect(postHeaders()).toHaveLength(1));
    await user.clear(screen.getByLabelText("Apertura inicial"));
    await user.type(screen.getByLabelText("Apertura inicial"), "500");
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));
    await waitFor(() => expect(postHeaders()).toHaveLength(2));
    const [first, second] = postHeaders().map((headers) => headers.get("x-idempotency-key"));
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
    expect(attempt).toBe(2);
  });

  it("closes the session and renders diferencia with resultado", async () => {
    const user = userEvent.setup();
    stubRoutes({
      estados: () => Promise.resolve(jsonResponse({ data: OPEN_ESTADO, ok: true }, 200))
    });
    renderPage();
    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Contado"), "1150");
    await user.type(screen.getByLabelText("Retiros"), "100");
    await user.click(screen.getByRole("button", { name: "Cerrar caja" }));
    expect(await screen.findByText("Caja cerrada con éxito.")).toBeInTheDocument();
    expect(await screen.findByText("250")).toBeInTheDocument();
    expect(screen.getByText("sobrante")).toBeInTheDocument();
  });

  it("hides mutation forms for forbidden roles", async () => {
    stubRoutes({ role: "vendedor" });
    renderPage();
    expect(await screen.findByText("No hay una caja abierta.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fecha")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir caja" })).not.toBeInTheDocument();
  });
});
