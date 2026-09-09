// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { ordenesListKey, OrdenesListError, useOrders } from "./useOrders";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function listEnvelope(totalItems: number): Record<string, unknown> {
  return {
    ok: true,
    data: {
      canViewBoleta: false,
      counts: { todas: totalItems },
      items: [
        {
          boletaNumero: undefined,
          clienteId: "c_1",
          clienteNombre: "Cliente Uno",
          equipment: "Samsung A54",
          estado: "en_diagnostico",
          estimatedDisplay: "90 min",
          id: "o_1",
          numero: "0001-000001",
          paymentStatus: "pendiente",
          total: 1500,
          version: 1
        }
      ],
      page: 1,
      pageSize: 25,
      totalItems
    }
  };
}

function wrapper(client: ReturnType<typeof createTestQueryClient>): {
  wrapper: ({ children }: { children: ReactNode }) => ReactNode;
} {
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("useOrders", () => {
  it("owns the frozen list key factory", () => {
    const params = { dir: "asc", estado: "todas", page: 1, pageSize: 25, sort: "numero" };
    expect(ordenesListKey(params)).toEqual(["ordenes", "list", params]);
  });

  it("parses the frozen list envelope", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(listEnvelope(1), 200));
    const { wrapper: Wrapper } = wrapper(createTestQueryClient());
    const { result } = renderHook(
      () => useOrders({ dir: "asc", estado: "todas", page: 1, pageSize: 25, sort: "numero" }),
      { wrapper: Wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.totalItems).toBe(1);
    expect(result.current.data?.canViewBoleta).toBe(false);
    expect(result.current.data?.items[0]?.numero).toBe("0001-000001");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces malformed payloads as typed parse errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { items: "nope" } }, 200));
    const { wrapper: Wrapper } = wrapper(createTestQueryClient());
    const { result } = renderHook(() => useOrders({ estado: "todas" }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(OrdenesListError);
    expect((result.current.error as OrdenesListError).kind).toBe("parse");
  });

  it("surfaces transport failures as typed network errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValue(new Error("offline"));
    const { wrapper: Wrapper } = wrapper(createTestQueryClient());
    const { result } = renderHook(() => useOrders({ estado: "todas" }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as OrdenesListError).kind).toBe("network");
  });
});
