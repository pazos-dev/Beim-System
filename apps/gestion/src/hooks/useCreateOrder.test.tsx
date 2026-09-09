// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { OrdenesCreateError, useCreateOrder } from "./useCreateOrder";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function createdEnvelope(): Record<string, unknown> {
  return {
    ok: true,
    data: {
      clienteId: "c_1",
      estado: "en_diagnostico",
      id: "o_new",
      numero: "0001-000003",
      ownerId: "u-vendedor",
      paymentStatus: "pendiente",
      total: 900,
      version: 1
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("useCreateOrder", () => {
  it("posts the payload and invalidates ['ordenes'] on settle", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(createdEnvelope(), 201));
    const client = createTestQueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const Wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateOrder(), { wrapper: Wrapper });
    result.current.mutate({ clienteId: "c_1", total: 900 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe("o_new");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/ordenes",
      expect.objectContaining({ method: "POST" })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ordenes"] });
  });

  it("surfaces malformed payloads as typed parse errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { id: 42 } }, 201));
    const client = createTestQueryClient();
    const Wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateOrder(), { wrapper: Wrapper });
    result.current.mutate({ clienteId: "c_1", total: 900 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(OrdenesCreateError);
    expect((result.current.error as OrdenesCreateError).kind).toBe("parse");
  });

  it("surfaces transport failures as typed network errors", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValue(new Error("offline"));
    const client = createTestQueryClient();
    const Wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateOrder(), { wrapper: Wrapper });
    result.current.mutate({ clienteId: "c_1", total: 900 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as OrdenesCreateError).kind).toBe("network");
  });
});
