// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GestionMutationError, useGestionMutation } from "../useGestionMutation";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { refetchOnWindowFocus: false, retry: false }
    }
  });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { invalidateSpy, wrapper };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(crypto, "randomUUID").mockReturnValue("test-key-1" as `${string}-${string}-${string}-${string}-${string}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useGestionMutation", () => {
  it("posts JSON with an idempotency key, returns data, and invalidates the caller keys", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: "v_1" }, ok: true }, 201));
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(
      () =>
        useGestionMutation<{ id: string }, { name: string }>({
          buildBody: (variables) => ({ ...variables }),
          endpoint: "/api/gestion/ventas",
          invalidateKeys: [["ventas"], ["stock"]],
          method: "POST"
        }),
      { wrapper }
    );

    let data: unknown;
    await act(async () => {
      data = await result.current.mutateAsync({ name: "care" });
    });

    expect(data).toEqual({ id: "v_1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("/api/gestion/ventas");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.headers["x-idempotency-key"]).toBe("test-key-1");
    expect(JSON.parse(String(init.body))).toEqual({ name: "care" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ventas"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["stock"] });
  });

  it("surfaces the envelope error code and skips invalidation", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR" }, ok: false }, 422)
    );
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(
      () =>
        useGestionMutation<unknown, { ventaId: string }>({
          buildBody: (variables) => ({ motivo: "duplicada" }),
          endpoint: (variables) => `/api/gestion/ventas/${variables.ventaId}`,
          invalidateKeys: [["ventas"]],
          method: "PATCH"
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ ventaId: "v_9" })).rejects.toMatchObject({
        code: "VALIDATION_ERROR"
      });
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/gestion/ventas/v_9");
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(result.current.error).toBeInstanceOf(GestionMutationError);
    expect(result.current.error?.code).toBe("VALIDATION_ERROR");
  });

  it("maps a transport failure to a network error without invalidating", async () => {
    fetchMock.mockRejectedValue(new TypeError("connection down"));
    const { invalidateSpy, wrapper } = setup();
    const { result } = renderHook(
      () =>
        useGestionMutation<unknown, { name: string }>({
          buildBody: (variables) => ({ ...variables }),
          endpoint: "/api/gestion/clientes",
          invalidateKeys: [["clientes"]],
          method: "POST"
        }),
      { wrapper }
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ name: "Ana" })).rejects.toMatchObject({
        code: "network"
      });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
