// @vitest-environment jsdom
// Stale-list regression: creating an order must refresh the cached list
// (N items refetch as N+1) and stale detail queries refetch on the shared
// ['ordenes'] invalidation.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { useCreateOrder } from "./useCreateOrder";
import { useOrderDetail } from "./useOrderDetail";
import { useOrders } from "./useOrders";

const fetchMock = vi.fn();

interface OrderRow {
  clienteId: string;
  clienteNombre: string;
  equipment: string;
  estado: string;
  estimatedDisplay: string;
  id: string;
  numero: string;
  paymentStatus: string;
  total: number;
  version: number;
}

function row(id: string, numero: string): OrderRow {
  return {
    clienteId: "c_1",
    clienteNombre: "Cliente Uno",
    equipment: "—",
    estado: "en_diagnostico",
    estimatedDisplay: "—",
    id,
    numero,
    paymentStatus: "pendiente",
    total: 100,
    version: 1
  };
}

const store: { orders: OrderRow[] } = { orders: [row("o_1", "0001-000001"), row("o_2", "0001-000002")] };

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function listEnvelope(): Record<string, unknown> {
  return {
    ok: true,
    data: {
      canViewBoleta: false,
      counts: { todas: store.orders.length },
      items: store.orders,
      page: 1,
      pageSize: 25,
      totalItems: store.orders.length
    }
  };
}

function detailEnvelope(order: OrderRow): Record<string, unknown> {
  return { ok: true, data: { ...order, ownerId: "u-administrador" } };
}

function wrapper(client: QueryClient): {
  wrapper: ({ children }: { children: ReactNode }) => ReactNode;
} {
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  };
}

function detailCalls(): number {
  return fetchMock.mock.calls.filter(
    ([url]) => typeof url === "string" && url.startsWith("/api/gestion/ordenes/o_")
  ).length;
}

beforeEachRound();

function beforeEachRound(): void {
  store.orders = [row("o_1", "0001-000001"), row("o_2", "0001-000002")];
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  beforeEachRound();
});

describe("ordenes stale-list regression", () => {
  it("refetches the cached N-item list as N+1 after create settles", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url: unknown, init?: { method?: string; body?: string }) => {
      if (url === "/api/gestion/ordenes" && (init?.method ?? "GET") === "POST") {
        const created = row("o_3", "0001-000003");
        store.orders = [...store.orders, created];
        return jsonResponse({ ok: true, data: { ...created, ownerId: "u-vendedor" } }, 201);
      }
      return jsonResponse(listEnvelope(), 200);
    });
    const client = createTestQueryClient();
    const { wrapper: Wrapper } = wrapper(client);
    const list = renderHook(() => useOrders({ estado: "todas" }), { wrapper: Wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(list.result.current.data?.items.length).toBe(2);
    const create = renderHook(() => useCreateOrder(), { wrapper: Wrapper });
    create.result.current.mutate({ clienteId: "c_1", total: 100 });
    await waitFor(() => expect(create.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(list.result.current.data?.items.length).toBe(3));
  });

  it("refetches stale detail when ['ordenes'] is invalidated", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (url: unknown) => {
      if (typeof url === "string" && url.startsWith("/api/gestion/ordenes/o_")) {
        const order = store.orders.find((item) => url.endsWith(item.id)) ?? store.orders[0];
        return jsonResponse(detailEnvelope(order as OrderRow), 200);
      }
      return jsonResponse(listEnvelope(), 200);
    });
    const client = createTestQueryClient();
    const { wrapper: Wrapper } = wrapper(client);
    const detail = renderHook(() => useOrderDetail("o_1"), { wrapper: Wrapper });
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    expect(detailCalls()).toBe(1);
    await client.invalidateQueries({ queryKey: ["ordenes"] });
    await waitFor(() => expect(detailCalls()).toBe(2));
  });
});
