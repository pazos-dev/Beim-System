// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { setAuthToken } from "../../lib/api/cookies";
import { useListQuery } from "../useListQuery";

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

const LOAD_ERROR = "Could not load the list.";
const AUTH_ERROR = "Session is not valid.";
const BASE_URL = "http://api.test";

interface TestPayload {
  readonly items: readonly string[];
}

function parsePayload(payload: unknown): TestPayload {
  if (typeof payload !== "object" || payload === null) throw new Error(LOAD_ERROR);
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) throw new Error(LOAD_ERROR);
  return { items: [] };
}

function renderListHook(search = "", list?: () => Promise<Response>) {
  navigationState.search = search;
  fetchMock.mockImplementation(async () => (list ? list() : jsonResponse({ data: { items: [] }, ok: true }, 200)));
  return renderHook(
    () =>
      useListQuery<TestPayload>({
        apiPath: "/api/gestion/ventas",
        authError: AUTH_ERROR,
        basePath: "/app/ventas",
        baseUrl: BASE_URL,
        defaults: { estado: "all" },
        key: "ventas",
        loadError: LOAD_ERROR,
        normalize: (committed) => ({
          ...committed,
          estado: committed["estado"] === "confirmada" ? "confirmada" : "all"
        }),
        params: ["q", "estado", "page"],
        parse: parsePayload
      }),
    { wrapper: ({ children }) => <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider> }
  );
}

describe("useListQuery", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    setAuthToken("test-token");
  });

  it("reads URL params applying defaults and normalization", () => {
    const { result } = renderListHook("q=hola&page=3");

    expect(result.current.params).toEqual({ estado: "all", page: "3", q: "hola" });
    expect(result.current.drafts).toEqual({ estado: "all", page: "3", q: "hola" });
    expect(result.current.denied).toBe(false);
  });

  it("writes a param to the URL immediately preserving the rest", () => {
    const { result } = renderListHook("q=hola&page=2");

    act(() => {
      result.current.setParam("estado", "confirmada");
    });

    expect(navigationState.replace).toHaveBeenCalledWith("/app/ventas?q=hola&page=2&estado=confirmada");
  });

  it("debounces draft commits and resets the page", async () => {
    const { result } = renderListHook("page=2");

    act(() => {
      result.current.setDraft("q", "abc");
    });
    expect(navigationState.replace).not.toHaveBeenCalled();

    await waitFor(() => expect(navigationState.replace).toHaveBeenCalledWith("/app/ventas?q=abc"));
  });

  it("fetches desde la URL base configurable con el token de autenticación", async () => {
    const { result } = renderListHook("q=hola&estado=weird&page=2");

    await waitFor(() => expect(result.current.query.data).toEqual({ items: [] }));
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/gestion/ventas?q=hola&estado=all&page=2", {
      cache: "no-store",
      headers: { Authorization: "Bearer test-token" }
    });
  });

  it("surfaces the load error when the request fails", async () => {
    const { result } = renderListHook("", () => Promise.resolve(jsonResponse({ error: "boom", ok: false }, 500)));

    await waitFor(() => expect(result.current.query.error?.message).toBe(LOAD_ERROR));
  });

  it("marks denied on 401 responses", async () => {
    const { result } = renderListHook("", () => Promise.resolve(jsonResponse({ error: "unauthorized", ok: false }, 401)));

    await waitFor(() => expect(result.current.denied).toBe(true));
  });
});
