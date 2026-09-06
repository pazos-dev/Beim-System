// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { ToastProvider } from "../../../src/components/ui/Toast";
import ComprasPage from "./page";

const replaceMock = vi.fn();
let searchQuery = "";
const fetchMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(searchQuery)
}));

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function sessionResponse(role: string): Response {
  return jsonResponse({ data: { role }, ok: true }, 200);
}

function listResponse(): Response {
  return jsonResponse(
    {
      data: {
        items: [
          {
            cantidad: 10,
            comprobante: "FAC-001",
            costoUnitario: 120,
            fecha: "2026-09-06T10:00:00.000Z",
            id: "c_1",
            productoId: "p_1",
            proveedor: "Proveedor Uno",
            total: 1200
          }
        ],
        page: 1,
        pageSize: 25,
        totalItems: 1
      },
      ok: true
    },
    200
  );
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ComprasPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  searchQuery = "";
  replaceMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/gestion/auth/session")) return sessionResponse("administrador");
    if (url.includes("/api/gestion/compras")) return listResponse();
    return jsonResponse({ ok: false }, 404);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ComprasPage", () => {
  it("renders the entry form and history rows for an admin", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Proveedor Uno")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Compras" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Producto"), "p_1");
    expect(screen.getByLabelText("Producto")).toHaveValue("p_1");
  });

  it("syncs filter edits to the URL and resets the page", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Proveedor Uno");
    await user.type(screen.getByLabelText("Filtrar por proveedor"), "Proveedor");
    await waitFor(() => expect(replaceMock).toHaveBeenCalled(), { timeout: 2000 });
    const lastCall = replaceMock.mock.calls[replaceMock.mock.calls.length - 1][0] as string;
    expect(lastCall).toContain("proveedor=Proveedor");
    expect(lastCall).not.toContain("page=");
  });

  it("registers an entry with a per-attempt key, then shows a row and toast", async () => {
    const user = userEvent.setup();
    const keys: Array<string | null> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/gestion/auth/session")) return sessionResponse("administrador");
      if (init?.method === "POST") {
        keys.push((init?.headers as Record<string, string> | undefined)?.["x-idempotency-key"] ?? null);
        return jsonResponse({ data: { compra: { id: "c_2" } }, ok: true }, 201);
      }
      return listResponse();
    });
    renderPage();
    await screen.findByText("Proveedor Uno");

    await user.type(screen.getByLabelText("Producto"), "p_1");
    await user.type(screen.getByLabelText("Cantidad"), "10");
    await user.type(screen.getByLabelText("Costo unitario"), "120");
    await user.type(screen.getByLabelText("Proveedor"), "Proveedor Uno");
    await user.click(screen.getByRole("button", { name: "Registrar compra" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Compra registrada correctamente.");
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBeTruthy();
  });

  it("gates the page for non-admin roles", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/gestion/auth/session")) return sessionResponse("vendedor");
      return jsonResponse(
        { error: { code: "FORBIDDEN" }, ok: false },
        403
      );
    });
    renderPage();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar compra" })).not.toBeInTheDocument();
  });
});
