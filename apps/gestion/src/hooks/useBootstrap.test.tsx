// @vitest-environment jsdom
import { waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { BOOTSTRAP_KEY, useBootstrap } from "./useBootstrap";

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
  vi.unstubAllGlobals();
});

describe("useBootstrap", () => {
  it("fetches once under key ['bootstrap'] and parses the envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);
    const client = createTestQueryClient();

    const { result } = renderHook(() => useBootstrap(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/gestion/bootstrap", { cache: "no-store" });
    expect(result.current.data).toEqual(PAYLOAD.data);
    expect(client.getQueryState(BOOTSTRAP_KEY)?.dataUpdatedAt).toBeGreaterThan(0);
  });

  it("surfaces a load error when the envelope is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: false }, 500)));

    const { result } = renderHook(() => useBootstrap(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5_000 });
  });
});
