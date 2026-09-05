import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearSessionsForTests, ROLE_VALUES } from "../../../../src/server/handlers/auth";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { GET as devUsers } from "./users/route";
import { POST as devLogin } from "./login/route";
const USERS = { version: 1, users: ROLE_VALUES.map((role) => ({ id: `u-${role}`, username: role, credential: `dev-${role}`, displayName: `Nombre ${role}`, role, active: true })) };
const PERMISSIONS = { version: 1, permissions: Object.fromEntries(ROLE_VALUES.map((role) => [role, ["orders.create"]])) };
let directory = "";
const previousDataDir = process.env.GESTION_DATA_DIR;
const previousNodeEnv = process.env.NODE_ENV;
function devLoginRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/gestion/dev/login", { method: "POST", body: JSON.stringify(body) });
}
beforeEach(async () => {
  clearSessionsForTests();
  directory = await mkdtemp(join(tmpdir(), "gestion-dev-routes-"));
  await writeFile(join(directory, "users.json"), `${JSON.stringify(USERS)}\n`, "utf8");
  await writeFile(join(directory, "role-permissions.json"), `${JSON.stringify(PERMISSIONS)}\n`, "utf8");
  await writeFile(join(directory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
  process.env.GESTION_DATA_DIR = directory;
  process.env.NODE_ENV = "test";
});
afterEach(async () => {
  if (previousDataDir === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDir;
  process.env.NODE_ENV = previousNodeEnv;
  await rm(directory, { recursive: true, force: true });
});
describe("dev routes", () => {
  it("responde 403 en producción sin leer el almacén", async () => {
    process.env.NODE_ENV = "production";
    expect((await devUsers()).status).toBe(403);
  });
  it("lista usuarios sin credential y con permisos resueltos", async () => {
    const response = await devUsers();
    expect(response.status).toBe(200);
    const payload = (await response.json()) as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(ROLE_VALUES.length);
    for (const item of payload) {
      expect(item).toMatchObject({ username: expect.any(String) });
      expect(item).toHaveProperty("permissions", ["orders.create"]);
      expect(item).not.toHaveProperty("credential");
    }
    expect(JSON.stringify(payload)).not.toContain("dev-vendedor");
  });
  it("loguea un usuario válido con cookie y auditoría", async () => {
    const response = await devLogin(devLoginRequest({ username: "vendedor" }));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean; data: Record<string, unknown> };
    expect(payload).toMatchObject({ ok: true, data: { username: "vendedor" } });
    expect(payload.data).not.toHaveProperty("credential");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(SESSION_COOKIE_NAME);
    expect(setCookie.toLowerCase()).toContain("httponly");
    const audit = JSON.parse(await readFile(join(directory, "audit.json"), "utf8")) as { events: Array<Record<string, unknown>> };
    expect(audit.events.at(-1)).toMatchObject({ accion: "auth.login", resultado: "ok" });
  });
  it("responde 401 para un usuario inexistente", async () => {
    const response = await devLogin(devLoginRequest({ username: "nadie" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("responde 403 en producción sin tocar el almacén", async () => {
    process.env.NODE_ENV = "production";
    const before = await readFile(join(directory, "audit.json"), "utf8");
    const response = await devLogin(devLoginRequest({ username: "vendedor" }));
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await readFile(join(directory, "audit.json"), "utf8")).toBe(before);
  });
});
