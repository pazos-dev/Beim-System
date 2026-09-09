// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "../../store/session.slice";
import { createRecordedFetch } from "../../test/fixtures/http/recorded-fetch";
import error401 from "../../test/fixtures/http/errors/401.json";
import loginFixture from "../../test/fixtures/http/login.json";
import { ApiError, SESSION_LOGIN_PATH, apiFetch, redirectToLogin } from "./api-fetch";

const ACTOR = {
  displayName: "Ana Vendedora",
  id: "u_ana",
  role: "vendedor" as const,
  username: "ana"
};

function explodeSockets(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Socket opened: tests must inject fetchImpl.");
    })
  );
}

beforeEach(() => {
  useSessionStore.getState().clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiFetch bearer injection", () => {
  it("attaches Authorization: Bearer <token> from the session store", async () => {
    explodeSockets();
    useSessionStore.getState().setSession(ACTOR, "recorded-dev-token");
    const recorded = createRecordedFetch({
      "/api/v1/bootstrap": { body: { data: {}, ok: true }, status: 200 }
    });

    await apiFetch("/bootstrap", { fetchImpl: recorded.fetchImpl });

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.headers["authorization"]).toBe("Bearer recorded-dev-token");
  });

  it("sends no Authorization header when logged out", async () => {
    explodeSockets();
    const recorded = createRecordedFetch({
      "/api/v1/bootstrap": { body: { data: {}, ok: true }, status: 200 }
    });

    await apiFetch("/bootstrap", { fetchImpl: recorded.fetchImpl });

    expect(recorded.calls[0]?.headers["authorization"]).toBeUndefined();
  });
});

describe("apiFetch envelope", () => {
  it("unwraps { ok:true, data } using the recorded login fixture shape", async () => {
    explodeSockets();
    const recorded = createRecordedFetch({
      "/api/v1/auth/gestion-login": { body: loginFixture, status: 200 }
    });

    const data = await apiFetch<{ readonly token: string }>("/auth/gestion-login", {
      fetchImpl: recorded.fetchImpl
    });

    expect(data.token).toBe("recorded-dev-token");
  });

  it("surfaces { ok:false, error } as a server ApiError", async () => {
    explodeSockets();
    const recorded = createRecordedFetch({
      "/api/v1/clients": {
        body: { error: { code: "forbidden", message: "Denied." }, ok: false },
        status: 403
      }
    });

    const failure = await apiFetch("/clients", { fetchImpl: recorded.fetchImpl }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).kind).toBe("server");
    expect((failure as ApiError).status).toBe(403);
    expect((failure as ApiError).code).toBe("forbidden");
  });

  it("maps network failures to kind network", async () => {
    const failure = await apiFetch("/clients", {
      fetchImpl: () => Promise.reject(new Error("down"))
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).kind).toBe("network");
  });

  it("maps malformed payloads to kind parse", async () => {
    explodeSockets();
    const recorded = createRecordedFetch({
      "/api/v1/clients": { body: { unexpected: true }, status: 200 }
    });

    const failure = await apiFetch("/clients", { fetchImpl: recorded.fetchImpl }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).kind).toBe("parse");
  });
});

describe("apiFetch 401 session death", () => {
  it("clears actor+token and routes to login using the recorded 401 fixture", async () => {
    explodeSockets();
    useSessionStore.getState().setSession(ACTOR, "stale-token");
    const recorded = createRecordedFetch({
      "/api/v1/clients": { body: error401, status: 401 }
    });
    const assign = vi.fn();
    const onUnauthorized = vi.fn();

    const failure = await apiFetch("/clients", {
      fetchImpl: recorded.fetchImpl,
      onUnauthorized,
      redirectTo: assign
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(useSessionStore.getState().actor).toBeNull();
    expect(useSessionStore.getState().token).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("redirects to the login path via the navigation seam", () => {
    const assign = vi.fn();

    redirectToLogin(assign);

    expect(assign).toHaveBeenCalledWith(SESSION_LOGIN_PATH);
  });

  it("never logs the token", async () => {
    explodeSockets();
    useSessionStore.getState().setSession(ACTOR, "super-secret-token");
    const recorded = createRecordedFetch({
      "/api/v1/clients": { body: error401, status: 401 }
    });
    const logged: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });
    }

    await apiFetch("/clients", {
      fetchImpl: recorded.fetchImpl,
      redirectTo: vi.fn()
    }).catch(() => null);

    expect(logged.join("\n")).not.toContain("super-secret-token");
  });
});
