import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CONSOLE_BASE_URL,
  exchangeConsoleLogin,
  resolveConsoleApiBaseUrl,
  revokeConsoleSession,
  type ConsoleFetch
} from "./api-console-session";
import {
  attachApiBearer,
  clearApiBearer,
  clearSessionMemoryForTests,
  configureSessionStore,
  getApiBearer
} from "./session-store";

const BASE_URL = "http://console-test:4000";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function consoleLoginPayload(token = "console-bearer-1"): Record<string, unknown> {
  return {
    ok: true,
    data: {
      token,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      user: { id: "c-1", username: "vendedor", name: "Vendedor", role: "vendedor" }
    }
  };
}

describe("exchangeConsoleLogin", () => {
  it("maps a 200 response to the bearer with expiry in ms", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: ConsoleFetch = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, consoleLoginPayload());
    };

    const result = await exchangeConsoleLogin({
      baseUrl: BASE_URL,
      username: "vendedor",
      password: "dev-vendedor",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error("Expected the exchange to succeed.");
    expect(result.value.token).toBe("console-bearer-1");
    expect(Number.isSafeInteger(result.value.expiresAtMs)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/auth/gestion-login`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({
      username: "vendedor",
      password: "dev-vendedor"
    });
  });

  it("accepts a numeric expiry from the console payload", async () => {
    const expiresAtMs = Date.now() + 3_600_000;
    const fetchImpl: ConsoleFetch = async () =>
      jsonResponse(200, { ok: true, data: { token: "t", expiresAt: expiresAtMs } });

    const result = await exchangeConsoleLogin({
      baseUrl: BASE_URL,
      username: "vendedor",
      password: "dev-vendedor",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: true, value: { token: "t", expiresAtMs } });
  });

  it("maps 401 to AUTHENTICATION_REQUIRED without leaking the credential", async () => {
    const fetchImpl: ConsoleFetch = async () =>
      jsonResponse(401, { ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });

    const result = await exchangeConsoleLogin({
      baseUrl: BASE_URL,
      username: "vendedor",
      password: "secret-credential",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    if (result.ok) throw new Error("Expected the exchange to fail.");
    expect(JSON.stringify(result.error)).not.toContain("secret-credential");
  });

  it("maps 422 to VALIDATION_ERROR", async () => {
    const fetchImpl: ConsoleFetch = async () =>
      jsonResponse(422, { ok: false, error: { code: "VALIDATION_ERROR" } });

    const result = await exchangeConsoleLogin({
      baseUrl: BASE_URL,
      username: "vendedor",
      password: "dev-vendedor",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("maps 429 to DEPENDENCY_UNAVAILABLE with a rate-limit note", async () => {
    const fetchImpl: ConsoleFetch = async () =>
      jsonResponse(429, { ok: false, error: { code: "RATE_LIMITED" } });

    const result = await exchangeConsoleLogin({
      baseUrl: BASE_URL,
      username: "vendedor",
      password: "dev-vendedor",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } });
    if (result.ok) throw new Error("Expected the exchange to fail.");
    expect(JSON.stringify(result.error)).toMatch(/rate limit/i);
  });

  it("maps network failures to DEPENDENCY_UNAVAILABLE without throwing", async () => {
    const fetchImpl: ConsoleFetch = async () => {
      throw new TypeError("fetch failed");
    };

    const result = await exchangeConsoleLogin({
      baseUrl: BASE_URL,
      username: "vendedor",
      password: "dev-vendedor",
      fetchImpl
    });

    expect(result).toMatchObject({ ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } });
  });

  it("maps unexpected statuses and malformed payloads to DEPENDENCY_UNAVAILABLE", async () => {
    const serverError: ConsoleFetch = async () => new Response("boom", { status: 500 });
    const malformed: ConsoleFetch = async () => jsonResponse(200, { ok: true, data: {} });

    for (const fetchImpl of [serverError, malformed]) {
      const result = await exchangeConsoleLogin({
        baseUrl: BASE_URL,
        username: "vendedor",
        password: "dev-vendedor",
        fetchImpl
      });
      expect(result).toMatchObject({ ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } });
    }
  });
});

describe("revokeConsoleSession", () => {
  it("sends the bearer to the console logout endpoint and reports ok", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: ConsoleFetch = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, { ok: true, data: { loggedOut: true } });
    };

    const result = await revokeConsoleSession({ baseUrl: BASE_URL, token: "console-bearer-1", fetchImpl });

    expect(result).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/api/v1/auth/logout`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer console-bearer-1"
    );
  });

  it("stays ok when the console rejects or the network is down", async () => {
    const failing: ConsoleFetch = async () => new Response("gone", { status: 500 });
    const down: ConsoleFetch = async () => {
      throw new TypeError("fetch failed");
    };

    for (const fetchImpl of [failing, down]) {
      const result = await revokeConsoleSession({ baseUrl: BASE_URL, token: "t", fetchImpl });
      expect(result).toMatchObject({ ok: true });
    }
  });
});

describe("resolveConsoleApiBaseUrl", () => {
  const previous = process.env.BEIM_API_BASE_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.BEIM_API_BASE_URL;
    else process.env.BEIM_API_BASE_URL = previous;
  });

  it("prefers BEIM_API_BASE_URL and falls back to the local default", () => {
    process.env.BEIM_API_BASE_URL = "http://console:4000";
    expect(resolveConsoleApiBaseUrl()).toBe("http://console:4000");
    delete process.env.BEIM_API_BASE_URL;
    expect(resolveConsoleApiBaseUrl()).toBe(DEFAULT_CONSOLE_BASE_URL);
  });
});

describe("apiBearer slot in session-store", () => {
  let directories: string[] = [];
  let previousDataDir: string | undefined;

  beforeEach(() => {
    directories = [];
    previousDataDir = process.env.GESTION_DATA_DIR;
    clearSessionMemoryForTests();
  });

  afterEach(async () => {
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
    clearSessionMemoryForTests();
    if (previousDataDir === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDir;
  });

  async function seedSession(): Promise<{ directory: string; token: string }> {
    const directory = await mkdtemp(join(tmpdir(), "gestion-api-bearer-"));
    directories.push(directory);
    const nowMs = Date.now();
    await writeFile(
      join(directory, "sesiones.json"),
      `${JSON.stringify({
        version: 1,
        sessions: [
          {
            token: "sess-1",
            actor: { id: "u-1", username: "vendedor", displayName: "Vendedor", role: "vendedor" },
            createdAt: nowMs,
            expiresAt: nowMs + 3_600_000
          }
        ]
      })}\n`,
      "utf8"
    );
    configureSessionStore(directory);
    return { directory, token: "sess-1" };
  }

  it("round-trips attach/get/clear and survives a simulated restart", async () => {
    const { directory, token } = await seedSession();
    expect(getApiBearer(token)).toBeUndefined();

    attachApiBearer(token, { token: "console-bearer-1", expiresAtMs: Date.now() + 1_800_000 });
    expect(getApiBearer(token)).toMatchObject({ token: "console-bearer-1" });

    // Simulated restart: memory is empty, the bearer reloads from disk.
    clearSessionMemoryForTests();
    expect(getApiBearer(token)).toMatchObject({ token: "console-bearer-1" });

    const raw = JSON.parse(await readFile(join(directory, "sesiones.json"), "utf8")) as {
      sessions: Array<{ token: string; apiBearer?: { token: string; expiresAt: number } }>;
    };
    expect(raw.sessions[0]?.apiBearer?.token).toBe("console-bearer-1");
    expect(Number.isSafeInteger(raw.sessions[0]?.apiBearer?.expiresAt)).toBe(true);

    clearApiBearer(token);
    expect(getApiBearer(token)).toBeUndefined();
    clearSessionMemoryForTests();
    const reread = JSON.parse(await readFile(join(directory, "sesiones.json"), "utf8")) as {
      sessions: Array<{ token: string; apiBearer?: unknown }>;
    };
    expect(reread.sessions[0]).not.toHaveProperty("apiBearer");
  });

  it("ignores unknown sessions without throwing", async () => {
    await seedSession();
    expect(() => attachApiBearer("missing", { token: "t", expiresAtMs: Date.now() })).not.toThrow();
    expect(getApiBearer("missing")).toBeUndefined();
    expect(() => clearApiBearer("missing")).not.toThrow();
  });
});
