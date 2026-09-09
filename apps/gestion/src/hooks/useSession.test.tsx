// @vitest-environment jsdom
// Bearer session suite (PR2): login/logout flow through `api-fetch` against
// recorded fixtures. Zero sockets: the global fetch is replaced per test with
// a URL-routed stub; the 401 session-death navigation is owned by the
// `api-fetch` suite (PR1) and asserted here as state clear + invalidation.
import { waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../test/query-client";
import { resolveApiBaseUrl } from "../lib/http/api-config";
import { useSessionStore, type UserActor } from "../store/session.slice";
import { useThemeStore } from "../store/theme.slice";
import { LOGIN_PATH, LOGOUT_PATH } from "./useSession";
import { BOOTSTRAP_KEY } from "./useBootstrap";
import { loginRequest, logoutRequest, useLogin, useLogout, useSessionRole, useSessionSync } from "./useSession";
import loginFixture from "../test/fixtures/http/login.json";
import logoutFixture from "../test/fixtures/http/logout.json";
import unauthorizedFixture from "../test/fixtures/http/errors/401.json";

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
const TOKEN = "recorded-dev-token";

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

// URL-routed stub over the recorded fixtures. Unknown URLs answer 404 so a
// wrong endpoint fails loudly instead of hanging the hook.
function mockBearerApi() {
  return vi.fn((url: unknown) => {
    const endpoint = String(url);
    if (endpoint.endsWith(LOGIN_PATH)) return Promise.resolve(jsonResponse(loginFixture));
    if (endpoint.endsWith(LOGOUT_PATH)) return Promise.resolve(jsonResponse(logoutFixture));
    if (endpoint.endsWith("/bootstrap")) {
      return Promise.resolve(jsonResponse({ data: { meta: { version: 1 } }, ok: true }));
    }
    return Promise.resolve(jsonResponse({ error: { code: "not-found" }, ok: false }, 404));
  });
}

function seedSession(): void {
  useSessionStore.getState().setSession(ACTOR, TOKEN);
}

beforeEach(() => {
  useSessionStore.setState({ actor: null, token: null });
  vi.unstubAllGlobals();
});

describe("useSessionRole", () => {
  it("reads the actor role via the session selector", () => {
    seedSession();

    const { result } = renderHook(() => useSessionRole(), { wrapper: wrapper() });

    expect(result.current).toBe("vendedor");
  });

  it("returns undefined without a logged-in actor", () => {
    const { result } = renderHook(() => useSessionRole(), { wrapper: wrapper() });

    expect(result.current).toBeUndefined();
  });
});

describe("useSessionSync", () => {
  it("writes the actor while a token is held and clears on null", () => {
    seedSession();

    const { result } = renderHook(() => useSessionSync(), { wrapper: wrapper() });

    act(() => {
      result.current(null);
    });
    expect(useSessionStore.getState().actor).toBeNull();
    expect(useSessionStore.getState().token).toBeNull();

    useSessionStore.setState({ token: TOKEN });
    act(() => {
      result.current(ACTOR);
    });
    expect(useSessionStore.getState().actor).toEqual(ACTOR);
  });

  it("ignores an actor when no Bearer token is held (fail-closed)", () => {
    const { result } = renderHook(() => useSessionSync(), { wrapper: wrapper() });

    act(() => {
      result.current(ACTOR);
    });

    expect(useSessionStore.getState().actor).toBeNull();
  });
});

describe("loginRequest", () => {
  it("posts credentials to the Bearer login endpoint and maps user to actor", async () => {
    const fetchMock = mockBearerApi();
    vi.stubGlobal("fetch", fetchMock);

    const { actor, token } = await loginRequest({ credential: "dev-vendedor", username: "ana" });

    expect(token).toBe(TOKEN);
    expect(actor).toEqual(ACTOR);
    expect(fetchMock).toHaveBeenCalledWith(
      `${resolveApiBaseUrl()}${LOGIN_PATH}`,
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("useLogin", () => {
  it("stores actor and token on success and invalidates ['bootstrap'] on settle", async () => {
    vi.stubGlobal("fetch", mockBearerApi());
    const client = createTestQueryClient();
    await client.prefetchQuery({ queryFn: () => Promise.resolve({}), queryKey: BOOTSTRAP_KEY });

    const { result } = renderHook(() => useLogin(), { wrapper: wrapper(client) });

    expect(client.getQueryState(BOOTSTRAP_KEY)?.isInvalidated).toBe(false);

    act(() => {
      result.current.mutate({ credential: "dev-vendedor", username: "ana" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useSessionStore.getState().actor).toEqual(ACTOR);
    expect(useSessionStore.getState().token).toBe(TOKEN);
    await waitFor(() =>
      expect(client.getQueryState(BOOTSTRAP_KEY)?.isInvalidated).toBe(true)
    );
  });
});

describe("logoutRequest", () => {
  it("carries the Bearer header while logged in", async () => {
    seedSession();
    const fetchMock = mockBearerApi();
    vi.stubGlobal("fetch", fetchMock);

    await logoutRequest();

    expect(fetchMock).toHaveBeenCalledWith(
      `${resolveApiBaseUrl()}${LOGOUT_PATH}`,
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: `Bearer ${TOKEN}` }),
        method: "POST"
      })
    );
  });
});

describe("useLogout", () => {
  it("clears actor and token, keeps theme oscuro, and invalidates ['bootstrap']", async () => {
    seedSession();
    useThemeStore.setState({ theme: "oscuro" });
    vi.stubGlobal("fetch", mockBearerApi());
    const client = createTestQueryClient();
    await client.prefetchQuery({ queryFn: () => Promise.resolve({}), queryKey: BOOTSTRAP_KEY });

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(client) });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useSessionStore.getState().actor).toBeNull();
    expect(useSessionStore.getState().token).toBeNull();
    expect(useThemeStore.getState().theme).toBe("oscuro");
    await waitFor(() =>
      expect(client.getQueryState(BOOTSTRAP_KEY)?.isInvalidated).toBe(true)
    );
  });

  it("treats a 401 as session death: clears actor and token on settle", async () => {
    seedSession();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(unauthorizedFixture, 401)));
    const client = createTestQueryClient();
    await client.prefetchQuery({ queryFn: () => Promise.resolve({}), queryKey: BOOTSTRAP_KEY });

    const { result } = renderHook(() => useLogout(), { wrapper: wrapper(client) });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useSessionStore.getState().actor).toBeNull();
    expect(useSessionStore.getState().token).toBeNull();
    await waitFor(() =>
      expect(client.getQueryState(BOOTSTRAP_KEY)?.isInvalidated).toBe(true)
    );
  });
});
