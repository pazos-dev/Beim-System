// @vitest-environment jsdom
// Bootstrap suite (PR2): TEMPORARY binding to the same-origin Next route
// `/api/gestion/bootstrap` (JsonStore-backed) until a backend aggregate
// exists — see TODO(http-bootstrap) in `./useBootstrap`. Zero sockets via
// global stub. Bearer/api-fetch transport stays for everything else.
import { waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { resolveApiBaseUrl } from "../lib/http/api-config";
import { useSessionStore } from "../store/session.slice";
import { BOOTSTRAP_KEY, BOOTSTRAP_PATH, useBootstrap } from "./useBootstrap";

function wrapper(client = createTestQueryClient()) {
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const PAYLOAD = { data: { meta: { version: 1 }, users: [] }, ok: true };

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

beforeEach(() => {
  useSessionStore.setState({ actor: null, token: null });
  vi.unstubAllGlobals();
});

describe("useBootstrap", () => {
  it("is temporarily bound to the Next /api/gestion/bootstrap route (TODO http-bootstrap)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);
    const client = createTestQueryClient();

    const { result } = renderHook(() => useBootstrap(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(BOOTSTRAP_PATH).toBe("/api/gestion/bootstrap");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/bootstrap",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.current.data).toEqual(PAYLOAD.data);
    expect(client.getQueryState(BOOTSTRAP_KEY)?.dataUpdatedAt).toBeGreaterThan(0);
  });

  it("bypasses the Bearer api base while the temporary binding holds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBootstrap(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl.startsWith(resolveApiBaseUrl())).toBe(false);
  });

  it("surfaces a load error when the envelope is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: false }, 500)));

    const { result } = renderHook(() => useBootstrap(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 });
  });
});
