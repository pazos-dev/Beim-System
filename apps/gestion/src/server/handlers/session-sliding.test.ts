import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthService,
  clearSessionsForTests,
  resolveSession
} from "./auth";
import { isSessionCookieFormatValid } from "./session";

const T0 = new Date("2026-01-05T10:00:00.000Z").getTime();
const MINUTE = 60 * 1000;

const users = {
  version: 1,
  users: [
    {
      id: "u-vendedor",
      username: "vendedor",
      credential: "dev-vendedor",
      displayName: "Vendedor",
      role: "vendedor",
      active: true
    }
  ]
};

const permissions = {
  version: 1,
  permissions: { vendedor: ["orders.create"] }
};

const previousMaxAge = process.env.GESTION_SESSION_MAX_AGE_SECONDS;
const previousSliding = process.env.GESTION_SESSION_SLIDING_SECONDS;

function setSessionEnv(maxAge: string, sliding: string): void {
  process.env.GESTION_SESSION_MAX_AGE_SECONDS = maxAge;
  process.env.GESTION_SESSION_SLIDING_SECONDS = sliding;
}

async function makeService(): Promise<{ service: AuthService; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "gestion-session-sliding-"));
  await writeFile(join(directory, "users.json"), `${JSON.stringify(users)}\n`, "utf8");
  await writeFile(join(directory, "role-permissions.json"), `${JSON.stringify(permissions)}\n`, "utf8");
  await writeFile(join(directory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
  return { service: new AuthService(directory), directory };
}

async function loginCookie(service: AuthService): Promise<string> {
  const result = await service.login({ username: "vendedor", credential: "dev-vendedor" });
  if (!result.ok) throw new Error("Expected the fixture login to succeed.");
  return result.value.cookieValue;
}

function cookieExpirySeconds(cookieValue: string): number {
  const expiry = cookieValue.split(".")[1];
  if (expiry === undefined) throw new Error("Expected a versioned session cookie.");
  return Number(expiry);
}

describe("expiración deslizante de sesión", () => {
  let directories: string[] = [];

  beforeEach(() => {
    directories = [];
    clearSessionsForTests();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(async () => {
    for (const directory of directories) {
      await rm(directory, { recursive: true, force: true });
    }
    clearSessionsForTests();
    vi.useRealTimers();
    if (previousMaxAge === undefined) delete process.env.GESTION_SESSION_MAX_AGE_SECONDS;
    else process.env.GESTION_SESSION_MAX_AGE_SECONDS = previousMaxAge;
    if (previousSliding === undefined) delete process.env.GESTION_SESSION_SLIDING_SECONDS;
    else process.env.GESTION_SESSION_SLIDING_SECONDS = previousSliding;
  });

  it("la actividad extiende la expiración más allá de la ventana inicial", async () => {
    setSessionEnv("7200", "600");
    const { service, directory } = await makeService();
    directories.push(directory);
    const cookie = await loginCookie(service);

    // Actividad a los 9 minutos: renueva la ventana 10 minutos hacia adelante.
    vi.setSystemTime(T0 + 9 * MINUTE);
    expect(resolveSession(cookie, new Date())).toMatchObject({ id: "u-vendedor" });

    // A los 11 minutos la ventana inicial ya habría expirado sin renovación.
    vi.setSystemTime(T0 + 11 * MINUTE);
    expect(resolveSession(cookie, new Date())).toMatchObject({ id: "u-vendedor" });
  });

  it("sin actividad la sesión expira igual", async () => {
    setSessionEnv("7200", "600");
    const { service, directory } = await makeService();
    directories.push(directory);
    const cookie = await loginCookie(service);

    vi.setSystemTime(T0 + 11 * MINUTE);
    expect(resolveSession(cookie, new Date())).toBeNull();
  });

  it("el tope absoluto se respeta aunque haya actividad continua", async () => {
    setSessionEnv("1800", "3600");
    const { service, directory } = await makeService();
    directories.push(directory);
    const cookie = await loginCookie(service);

    // Actividad cada 10 minutos: la sesión sigue viva hasta el tope de 30 minutos.
    vi.setSystemTime(T0 + 10 * MINUTE);
    expect(resolveSession(cookie, new Date())).toMatchObject({ id: "u-vendedor" });
    vi.setSystemTime(T0 + 20 * MINUTE);
    expect(resolveSession(cookie, new Date())).toMatchObject({ id: "u-vendedor" });

    // Pasado el tope absoluto, ni la actividad la revive.
    vi.setSystemTime(T0 + 31 * MINUTE);
    expect(resolveSession(cookie, new Date())).toBeNull();
  });

  it("las env vars customizan los tiempos y la cookie embebe el tope absoluto", async () => {
    setSessionEnv("3600", "3600");
    const { service, directory } = await makeService();
    directories.push(directory);
    const cookie = await loginCookie(service);

    expect(cookieExpirySeconds(cookie)).toBe(Math.floor((T0 + 3600 * 1000) / 1000));
    expect(isSessionCookieFormatValid(cookie, new Date(T0 + 3599 * 1000))).toBe(true);
    expect(isSessionCookieFormatValid(cookie, new Date(T0 + 3601 * 1000))).toBe(false);
  });

  it("valores de env inválidos vuelven al default de 8 h", async () => {
    setSessionEnv("infinito", "-5");
    const { service, directory } = await makeService();
    directories.push(directory);
    const cookie = await loginCookie(service);

    expect(cookieExpirySeconds(cookie)).toBe(Math.floor((T0 + 8 * 60 * 60 * 1000) / 1000));
  });

  it("generación de sesión y Map intactos: formato, actor y logout", async () => {
    setSessionEnv("28800", "28800");
    const { service, directory } = await makeService();
    directories.push(directory);
    const cookie = await loginCookie(service);

    expect(cookie).toMatch(/^v1\.\d{10}\.[A-Za-z0-9_-]{1,256}$/);
    expect(resolveSession(cookie, new Date())).toMatchObject({
      id: "u-vendedor",
      username: "vendedor",
      role: "vendedor"
    });

    const logout = await service.logout(cookie);
    expect(logout).toMatchObject({ ok: true });
    expect(resolveSession(cookie, new Date())).toBeNull();
  });
});
