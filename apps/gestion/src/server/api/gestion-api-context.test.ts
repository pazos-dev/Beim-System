import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "../handlers/session";
import { resolveConsoleApiBaseUrl } from "../shared/api-console-session";
import { attachApiBearer } from "../shared/session-store";
import { tokenFromCookie } from "../shared/auth";
import { createSeedDirectory } from "../../test/seed-dir";
import {
  NEXT_IMPLEMENTATION_MESSAGE,
  resolveGestionApiContext,
  type GestionApiContext
} from "./gestion-api-context";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let adminCookie = "";

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("resolveGestionApiContext", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-api-context-");
    process.env.GESTION_DATA_DIR = directory;
    adminCookie = await loginAs("administrador");
  });

  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    const { rm } = await import("node:fs/promises");
    await rm(directory, { force: true, recursive: true });
  });

  it("uses an isolated temp directory instead of the repository data directory", () => {
    const repositoryDataDirectory = join(process.cwd(), "data");
    expect(directory).not.toBe(repositoryDataDirectory);
    expect(directory.startsWith(tmpdir())).toBe(true);
    expect(process.env.GESTION_DATA_DIR).toBe(directory);
    expect(process.env.GESTION_DATA_DIR).not.toBe(repositoryDataDirectory);
  });

  it("returns DEPENDENCY_UNAVAILABLE when the cookie is missing", () => {
    const result = resolveGestionApiContext(undefined);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toBe(NEXT_IMPLEMENTATION_MESSAGE);
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("returns DEPENDENCY_UNAVAILABLE when the cookie does not contain a session token", () => {
    const result = resolveGestionApiContext("not-a-session-cookie");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("returns DEPENDENCY_UNAVAILABLE when the session has no API bearer", () => {
    const sessionToken = tokenFromCookie(adminCookie);
    if (sessionToken === null) throw new Error("Expected a session token from the admin cookie.");
    const result = resolveGestionApiContext(adminCookie);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("returns the remote API context when a bearer is attached", () => {
    const sessionToken = tokenFromCookie(adminCookie);
    if (sessionToken === null) throw new Error("Expected a session token from the admin cookie.");
    attachApiBearer(sessionToken, { token: "remote-bearer-xyz", expiresAtMs: Date.now() + 3600000 });

    const result = resolveGestionApiContext(adminCookie);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const context = result.value as GestionApiContext;
      expect(context.baseUrl).toBe(resolveConsoleApiBaseUrl());
      expect(context.token).toBe("remote-bearer-xyz");
    }
  });

  it("never leaks the bearer token into error envelopes", () => {
    const secret = "secret-token-must-not-appear";
    const sessionToken = tokenFromCookie(adminCookie);
    if (sessionToken === null) throw new Error("Expected a session token from the admin cookie.");
    attachApiBearer(sessionToken, { token: secret, expiresAtMs: Date.now() + 3600000 });

    const result = resolveGestionApiContext("v1.9999999999.invalid-token");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.stringify(result.error)).not.toContain(secret);
      expect(JSON.stringify(result.error)).not.toContain(sessionToken);
    }
  });

  it("reads the base URL from the environment default", () => {
    const previousBaseUrl = process.env.BEIM_API_BASE_URL;
    try {
      process.env.BEIM_API_BASE_URL = "http://console-api.test";
      const sessionToken = tokenFromCookie(adminCookie);
      if (sessionToken === null) throw new Error("Expected a session token from the admin cookie.");
      attachApiBearer(sessionToken, { token: "bearer", expiresAtMs: Date.now() + 3600000 });

      const result = resolveGestionApiContext(adminCookie);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.baseUrl).toBe("http://console-api.test");
    } finally {
      if (previousBaseUrl === undefined) delete process.env.BEIM_API_BASE_URL;
      else process.env.BEIM_API_BASE_URL = previousBaseUrl;
    }
  });
});
