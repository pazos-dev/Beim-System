// @vitest-environment jsdom
import { waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { selectSessionRole, useSessionStore, type UserActor } from "../store/session.slice";
import { useThemeStore } from "../store/theme.slice";
import { BOOTSTRAP_KEY } from "./useBootstrap";
import {
  SESSION_QUERY_KEY,
  useLogin,
  useLogout,
  useSessionRole,
  useSessionSync
} from "./useSession";

function wrapper(client = createTestQueryClient()) {
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const ACTOR: UserActor = {
  displayName: "Ana Vendedora",
  id: "u_ana",
  role: "vendedor",
  username: "ana"
};

function sessionResponse(actor: unknown, status = 200): Response {
  return Response.json({ data: actor, ok: status === 200 }, { status });
}

// URL-aware mock: the login/logout hooks mount their own session sync
// subscription, so every endpoint must answer for its own URL. After a
// logout POST the session endpoint answers 401, mirroring the server.
function mockSessionApi(sessionActor: unknown, sessionStatus = 200) {
  let loggedOut = false;
  return vi.fn((url: unknown) => {
    const endpoint = String(url);
    if (endpoint.endsWith("/api/gestion/auth/login")) {
      return Promise.resolve(sessionResponse(ACTOR));
    }
    if (endpoint.endsWith("/api/gestion/auth/logout")) {
      loggedOut = true;
      return Promise.resolve(sessionResponse(ACTOR));
    }
    if (endpoint.endsWith("/api/gestion/bootstrap")) {
      return Promise.resolve(sessionResponse({ meta: { version: 1 } }));
    }
    if (loggedOut) return Promise.resolve(sessionResponse(null, 401));
    return Promise.resolve(sessionResponse(sessionActor, sessionStatus));
  });
}

beforeEach(() => {
  useSessionStore.setState({ actor: null });
  vi.unstubAllGlobals();
});

describe("useSessionRole", () => {
  it("reads the actor role via the session selector", () => {
    useSessionStore.getState().setUser(ACTOR);

    const { result } = renderHook(() => useSessionRole(), { wrapper: wrapper() });

    expect(result.current).toBe("vendedor");
    expect(selectSessionRole(useSessionStore.getState())).toBe("vendedor");
  });

  it("returns undefined without a logged-in actor", () => {
    const { result } = renderHook(() => useSessionRole(), { wrapper: wrapper() });

    expect(result.current).toBeUndefined();
  });
});

describe("useSessionSync", () => {
  it("writes the fetched actor and exposes a manual sync setter", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse(ACTOR)));

    const { result } = renderHook(() => useSessionSync(), { wrapper: wrapper() });

    await waitFor(() => expect(useSessionStore.getState().actor).toEqual(ACTOR));

    act(() => {
      result.current(null);
    });
    expect(useSessionStore.getState().actor).toBeNull();

    act(() => {
      result.current(ACTOR);
    });
    expect(useSessionStore.getState().actor).toEqual(ACTOR);
  });

  it("clears the actor when the session is unauthorized", async () => {
    useSessionStore.getState().setUser(ACTOR);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse(null, 401)));

    renderHook(() => useSessionSync(), { wrapper: wrapper() });

    await waitFor(() => expect(useSessionStore.getState().actor).toBeNull());
  });
});

describe("useLogin", () => {
  it("stores the actor on success and invalidates ['bootstrap'] on settle", async () => {
    const fetchMock = mockSessionApi(ACTOR);
    vi.stubGlobal("fetch", fetchMock);
    const client = createTestQueryClient();
    await client.prefetchQuery({ queryFn: () => Promise.resolve({}), queryKey: BOOTSTRAP_KEY });

    const { result } = renderHook(() => useLogin(), { wrapper: wrapper(client) });
    await waitFor(() => expect(useSessionStore.getState().actor).toEqual(ACTOR));

    expect(client.getQueryState(BOOTSTRAP_KEY)?.isInvalidated).toBe(false);

    act(() => {
      result.current.mutate({ credential: "dev-vendedor", username: "vendedor" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useSessionStore.getState().actor).toEqual(ACTOR);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gestion/auth/login",
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() =>
      expect(client.getQueryState(BOOTSTRAP_KEY)?.isInvalidated).toBe(true)
    );
  });
});

describe("useLogout", () => {
  it("clears the actor, keeps theme oscuro, and invalidates ['bootstrap']", async () => {
    useSessionStore.getState().setUser(ACTOR);
    useThemeStore.setState({ theme: "oscuro" });
    const fetchMock = mockSessionApi(ACTOR);
    vi.stubGlobal("fetch", fetchMock);
    const client = createTestQueryClient();
    await client.prefetchQuery({ queryFn: () => Promise.resolve({}), queryKey: BOOTSTRAP_KEY });

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(client) });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Settle invalidates the session query; the invalidation cancels any
    // in-flight pre-logout fetch, and the 401 refetch below proves no stale
    // 200 can resurrect the actor afterwards.
    await waitFor(() =>
      expect(client.getQueryState(SESSION_QUERY_KEY)?.status).toBe("error")
    );
    expect(useSessionStore.getState().actor).toBeNull();
    expect(useThemeStore.getState().theme).toBe("oscuro");
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/gestion/auth/logout")
    ).toBe(true);
    await waitFor(() =>
      expect(client.getQueryState(BOOTSTRAP_KEY)?.isInvalidated).toBe(true)
    );
  });
});
