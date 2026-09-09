// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { ordenesDetailKey, OrdenesDetailError, useOrderDetail } from "./useOrderDetail";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function detailEnvelope(): Record<string, unknown> {
  return {
    ok: true,
    data: {
      clienteId: "c_1",
      estado: "en_diagnostico",
      id: "o_1",
      numero: "0001-000001",
      ownerId: "u-administrador",
      paymentStatus: "pendiente",
      total: 1500,
      version: 1
    }
  };
}

function Wrapper({ children }: { children: ReactNode }): ReactNode {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("useOrderDetail", () => {
  it("owns the frozen detail key factory", () => {
    expect(ordenesDetailKey("abc")).toEqual(["ordenes", "detail", "abc"]);
  });

  it("parses the frozen detail envelope", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(detailEnvelope(), 200));
    const { result } = renderHook(() => useOrderDetail("o_1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.numero).toBe("0001-000001");
    expect(fetchMock).toHaveBeenCalledWith("/api/gestion/ordenes/o_1", expect.anything());
  });

  it("stays disabled without an id and never fetches", () => {
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useOrderDetail(""), { wrapper: Wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces malformed payloads as typed parse errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { id: 42 } }, 200));
    const { result } = renderHook(() => useOrderDetail("o_1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(OrdenesDetailError);
    expect((result.current.error as OrdenesDetailError).kind).toBe("parse");
  });
});
