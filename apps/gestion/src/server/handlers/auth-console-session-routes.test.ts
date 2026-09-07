import { rm } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as loginRoute } from "../../../app/api/gestion/auth/login/route";
import { POST as logoutRoute } from "../../../app/api/gestion/auth/logout/route";
import { createSeedDirectory } from "../../test/seed-dir";
import { AuthService, clearSessionsForTests, resolveSession } from "./auth";
import { SESSION_COOKIE_NAME } from "./session";
import { getApiBearer } from "../shared/session-store";

const CONSOLE_BASE_URL = "http://console-test:4000";
const CONSOLE_BEARER = "console-bearer-route-1";

function loginRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/gestion/auth/login", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function logoutRequest(cookie: string): NextRequest {
  return new NextRequest("http://localhost/api/gestion/auth/logout", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }
  });
}

function consoleLoginOk(token = CONSOLE_BEARER): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        token,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        user: { id: "c-1", username: "vendedor", name: "Vendedor", role: "vendedor" }
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function sessionTokenFromSetCookie(cookieValue: string): string {
  const token = cookieValue.split(".")[2];
  if (!token) throw new Error("Expected a versioned session cookie.");
  return token;
}

const previousDataDir = process.env.GESTION_DATA_DIR;
const previousConsoleBase = process.env.BEIM_API_BASE_URL;
let seedDirectory = "";

beforeAll(async () => {
  seedDirectory = await createSeedDirectory("gestion-auth-console-");
  process.env.GESTION_DATA_DIR = seedDirectory;
  process.env.BEIM_API_BASE_URL = CONSOLE_BASE_URL;
});

afterAll(async () => {
  if (previousDataDir === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDir;
  if (previousConsoleBase === undefined) delete process.env.BEIM_API_BASE_URL;
  else process.env.BEIM_API_BASE_URL = previousConsoleBase;
  clearSessionsForTests();
  await rm(seedDirectory, { force: true, recursive: true });
});

describe("POST /api/gestion/auth/login with console exchange", () => {
  beforeEach(() => {
    clearSessionsForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearSessionsForTests();
  });

  it("stores the console bearer while cookie and response stay actor-only", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return consoleLoginOk();
    });

    const response = await loginRoute(loginRequest({ username: "vendedor", credential: "dev-vendedor" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { id: "u-vendedor", username: "vendedor" } });
    expect(JSON.stringify(body)).not.toContain(CONSOLE_BEARER);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${CONSOLE_BASE_URL}/api/v1/auth/gestion-login`);
    // credential|password maps explicitly to the console password field.
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      username: "vendedor",
      password: "dev-vendedor"
    });

    const cookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    expect(cookie).toBeDefined();
    expect(cookie).not.toContain(CONSOLE_BEARER);
    expect(getApiBearer(sessionTokenFromSetCookie(cookie as string))).toMatchObject({
      token: CONSOLE_BEARER
    });
  });

  it("sends the password variant as the console password field", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return consoleLoginOk();
    });

    const response = await loginRoute(loginRequest({ username: "vendedor", password: "dev-vendedor" }));

    expect(response.status).toBe(200);
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      username: "vendedor",
      password: "dev-vendedor"
    });
  });

  it("continues local-only when the console API is down", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });

    const response = await loginRoute(loginRequest({ username: "vendedor", credential: "dev-vendedor" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { id: "u-vendedor" } });
    const cookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    expect(cookie).toBeDefined();
    expect(getApiBearer(sessionTokenFromSetCookie(cookie as string))).toBeUndefined();
    expect(resolveSession(cookie, new Date())).toMatchObject({ id: "u-vendedor" });
  });

  it("continues local-only when the console rejects the exchange", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ ok: false }), { status: 401 })
    );

    const response = await loginRoute(loginRequest({ username: "vendedor", credential: "dev-vendedor" }));

    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    expect(getApiBearer(sessionTokenFromSetCookie(cookie as string))).toBeUndefined();
  });
});

describe("POST /api/gestion/auth/logout with console revoke", () => {
  beforeEach(() => {
    clearSessionsForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearSessionsForTests();
  });

  async function loginCookie(bearer = CONSOLE_BEARER): Promise<string> {
    vi.stubGlobal("fetch", async () => consoleLoginOk(bearer));
    const response = await loginRoute(loginRequest({ username: "vendedor", credential: "dev-vendedor" }));
    vi.unstubAllGlobals();
    const cookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!cookie) throw new Error("Expected the login to set a session cookie.");
    return cookie;
  }

  it("revokes the console bearer before clearing the local session", async () => {
    const cookie = await loginCookie();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true, data: { loggedOut: true } }), { status: 200 });
    });

    const response = await logoutRoute(logoutRequest(cookie));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${CONSOLE_BASE_URL}/api/v1/auth/logout`);
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${CONSOLE_BEARER}`
    );
    // Local session is gone: service-level logout now fails as logged out.
    const service = new AuthService(seedDirectory);
    expect(resolveSession(cookie, new Date())).toBeNull();
    await expect(service.session(cookie)).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
  });

  it("still clears the local session when the console API is down", async () => {
    const cookie = await loginCookie();
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });

    const response = await logoutRoute(logoutRequest(cookie));

    expect(response.status).toBe(200);
    expect(resolveSession(cookie, new Date())).toBeNull();
  });
});
