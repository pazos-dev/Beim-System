// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import ReportesPage from "./page";

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

const SNAPSHOT = {
  compras: { cantidad: 3, total: 1500 },
  desde: "2026-09-01",
  gastos: { porCategoria: [{ categoria: "general", total: 200 }], total: 200 },
  hasta: "2026-09-30",
  neto: 8300,
  ventas: { cantidad: 5, devoluciones: 0, netas: 10000 }
};

function stubRoutes(): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/reportes")) {
      return jsonResponse({ data: SNAPSHOT, ok: true }, 200);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ReportesPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("ReportesPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    useUiStore.setState({ period: { type: "month", value: "2026-09" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ period: { type: "day", value: "" } });
  });

  it("loads the period snapshot from the header period and renders the table", async () => {
    stubRoutes();
    renderPage();

    expect(await screen.findByText("10000")).toBeInTheDocument();
    expect(screen.getByText("8300")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/reportes?desde=2026-09-01&hasta=2026-09-30",
      expect.objectContaining({ cache: "no-store" })
    );
  });

  it("exposes a CSV download link for the same period after choosing CSV", async () => {
    const user = userEvent.setup();
    stubRoutes();
    renderPage();

    await screen.findByText("10000");
    expect(screen.queryByRole("link", { name: "Descargar CSV" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Formato"), "csv");
    expect(screen.getByRole("link", { name: "Descargar CSV" })).toHaveAttribute(
      "href",
      "/api/gestion/reportes?desde=2026-09-01&hasta=2026-09-30&formato=csv"
    );
  });

  it("debounces range edits into the URL", async () => {
    stubRoutes();
    renderPage();

    await screen.findByText("10000");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-08-01" } });
    await waitFor(() =>
      expect(navigationState.replace).toHaveBeenCalledWith(expect.stringContaining("desde=2026-08-01"))
    );
  });

  it("shows access denied with a login link on 401", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
      if (String(input).startsWith("/api/gestion/reportes")) {
        return jsonResponse({ ok: false }, 401);
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    renderPage();

    expect(await screen.findByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });
});
