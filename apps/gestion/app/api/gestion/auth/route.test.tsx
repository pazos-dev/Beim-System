import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearSessionsForTests, ROLE_VALUES } from "../../../../src/server/handlers/auth.js";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session.js";
import { POST as login } from "./login/route.js";
import { POST as logout } from "./logout/route.js";
import { GET as session } from "./session/route.js";

const USERS = {
  version: 1,
  users: ROLE_VALUES.map((role) => ({
    id: `u-${role}`,
    username: role,
    credential: `dev-${role}`,
    displayName: role,
    role,
    active: true
  }))
};

const PERMISSIONS = {
  version: 1,
  permissions: Object.fromEntries(ROLE_VALUES.map((role) => [role, ["orders.create"]]))
};

let directory = "";
const previousDataDir = process.env.GESTION_DATA_DIR;

function postLogin(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/gestion/auth/login", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function withCookie(url: string, method: string, cookie: string): NextRequest {
  const request = new NextRequest(url, { method });
  request.cookies.set(SESSION_COOKIE_NAME, cookie);
  return request;
}

async function loginCookie(username: string, credential: string): Promise<string> {
  const response = await login(postLogin({ username, credential }));
  expect(response.status).toBe(200);
  const cookie = response.cookies.get(SESSION_COOKIE_NAME)?.value;
  expect(cookie).toBeDefined();
  return cookie ?? "";
}

beforeEach(async () => {
  clearSessionsForTests();
  directory = await mkdtemp(join(tmpdir(), "gestion-auth-routes-"));
  await writeFile(join(directory, "users.json"), `${JSON.stringify(USERS)}\n`, "utf8");
  await writeFile(join(directory, "role-permissions.json"), `${JSON.stringify(PERMISSIONS)}\n`, "utf8");
  await writeFile(join(directory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
  process.env.GESTION_DATA_DIR = directory;
});

afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDir;
  await rm(directory, { recursive: true, force: true });
});

describe("auth routes", () => {
  it("logs in and sets an httpOnly lax session cookie with the public actor", async () => {
    const response = await login(postLogin({ username: "vendedor", credential: "dev-vendedor" }));
    const payload = (await response.json()) as { ok: boolean; data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, data: { id: "u-vendedor", role: "vendedor" } });
    expect(payload.data).not.toHaveProperty("credential");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("rejects invalid credentials with 401 without mutating users.json", async () => {
    const before = await readFile(join(directory, "users.json"), "utf8");
    const response = await login(postLogin({ username: "vendedor", credential: "wrong" }));
    const payload = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(response.status).toBe(401);
    expect(payload).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    expect(JSON.stringify(payload)).not.toContain("wrong");
    expect(await readFile(join(directory, "users.json"), "utf8")).toBe(before);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("ignores a spoofed actor in the body and keeps the session role", async () => {
    const response = await login(postLogin({
      username: "vendedor",
      credential: "dev-vendedor",
      actorId: "u-administrador_principal",
      role: "administrador_principal"
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { role: "vendedor" } });
  });

  it("returns 401 for session without a cookie", async () => {
    const response = await session(new NextRequest("http://localhost/api/gestion/auth/session"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("clears the cookie on logout and invalidates the session", async () => {
    const cookie = await loginCookie("caja", "dev-caja");
    const me = await session(withCookie("http://localhost/api/gestion/auth/session", "GET", cookie));
    expect(me.status).toBe(200);
    const response = await logout(withCookie("http://localhost/api/gestion/auth/logout", "POST", cookie));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { role: "caja" } });
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
    expect((response.headers.get("set-cookie") ?? "").toLowerCase()).toContain("max-age=0");
    const after = await session(withCookie("http://localhost/api/gestion/auth/session", "GET", cookie));
    expect(after.status).toBe(401);
  });
});
