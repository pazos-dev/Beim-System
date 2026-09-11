// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useAuthStore } from "../../../src/lib/api/auth-store";
import { setAuthToken, clearAuthToken } from "../../../src/lib/api-config";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import CajaPage from "./page";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const CLOSED_SESSION = {
  id: "sc_1",
  businessDate: "2026-04-01",
  openingAmount: 1000,
  countedAmount: 0,
  difference: 0,
  closedAt: "2026-04-01T23:00:00Z",
};

const OPEN_SESSION = {
  ...CLOSED_SESSION,
  closedAt: null,
};

interface StubOptions {
  current?: unknown;
  openResponse?: unknown;
  closeResponse?: unknown;
}

function stubFetch(options: StubOptions = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);

    if (url.endsWith("/cash-sessions/current")) {
      return jsonResponse({ ok: true, data: options.current ?? CLOSED_SESSION });
    }

    if (url.endsWith("/cash-sessions") && init?.method === "POST") {
      return jsonResponse({ ok: true, data: options.openResponse ?? OPEN_SESSION }, 201);
    }

    if (url.includes("/cash-sessions/") && url.endsWith("/movements")) {
      return jsonResponse({ ok: true, data: { id: "m_1" } }, 201);
    }

    if (url.includes("/cash-sessions/") && url.endsWith("/close")) {
      return jsonResponse({ ok: true, data: options.closeResponse ?? CLOSED_SESSION });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function setActor(role: string): void {
  useAuthStore.setState({
    actor: { id: "u-1", name: "Test", role, username: "test" },
    token: "tok",
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

describe("CajaPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    setAuthToken("tok");
    setActor("caja");
    useUiStore.setState({ cajaFormRevision: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthToken();
    useAuthStore.setState({ actor: null, token: null });
    useUiStore.setState({ cajaFormRevision: 0 });
  });

  it("shows the closed banner and the open form when no session is open", async () => {
    stubFetch();
    renderPage();

    expect(await screen.findByText("No hay una caja abierta.")).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByLabelText("Apertura inicial")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contado")).not.toBeInTheDocument();
  });

  it("opens a session, flips the banner, and toasts", async () => {
    const user = userEvent.setup();
    stubFetch({ current: CLOSED_SESSION });
    renderPage();

    expect(await screen.findByText("No hay una caja abierta.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Fecha"), "2026-04-01");
    await user.type(screen.getByLabelText("Apertura inicial"), "1000");
    stubFetch({ current: OPEN_SESSION });
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    expect(await screen.findByText("Caja abierta con éxito.")).toBeInTheDocument();

    const postCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCalls).toHaveLength(1);
    expect(String(postCalls[0]?.[0])).toBe("http://localhost:4000/api/v1/cash-sessions");
  });

  it("closes the session and renders diferencia with resultado", async () => {
    const user = userEvent.setup();
    stubFetch({
      current: OPEN_SESSION,
      closeResponse: { ...CLOSED_SESSION, countedAmount: 1150, difference: 150 },
    });
    renderPage();

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Contado"), "1150");
    await user.type(screen.getByLabelText("Retiros"), "100");
    await user.click(screen.getByRole("button", { name: "Cerrar caja" }));

    expect(await screen.findByText("Caja cerrada con éxito.")).toBeInTheDocument();
    expect(await screen.findByText("150")).toBeInTheDocument();
    expect(screen.getByText("sobrante")).toBeInTheDocument();

    await waitFor(() => {
      const movementCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("/movements")
      );
      expect(movementCalls).toHaveLength(1);
    });

    const closeCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/close")
    );
    expect(closeCalls).toHaveLength(1);
  });

  it("hides mutation forms for forbidden roles", async () => {
    setActor("vendedor");
    stubFetch();
    renderPage();

    expect(await screen.findByText("No hay una caja abierta.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fecha")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir caja" })).not.toBeInTheDocument();
  });
});
