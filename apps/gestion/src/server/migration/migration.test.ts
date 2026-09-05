import { createHash } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "../../../app/api/gestion/admin/migration/dry-run/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { createSeedDirectory } from "../../test/seed-dir";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { dryRun } from "./migration";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let adminCookie = "";
let sellerCookie = "";
let fixture: Record<string, unknown> = {};
function request(cookie: string | undefined, method: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest("http://localhost/api/gestion/admin/migration/dry-run",
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function loginAs(username: string): Promise<string> {
  const result = await new AuthService(directory).login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}
async function hashStores(): Promise<string> {
  const names = (await readdir(directory)).filter((n) => n.endsWith(".json")).sort();
  const parts: string[] = [];
  for (const name of names) parts.push(`${name}:${createHash("sha256").update(await readFile(join(directory, name), "utf8")).digest("hex")}`);
  return parts.join("|");
}
describe("migration dry-run", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-migration-");
    process.env.GESTION_DATA_DIR = directory;
    fixture = JSON.parse(await readFile(join(process.cwd(), "fixtures", "legacy-sample.json"), "utf8")) as Record<string, unknown>;
    adminCookie = await loginAs("administrador");
    sellerCookie = await loginAs("vendedor");
  });
  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
  });
  it("mapea claves conocidas a sus owners con conteos", () => {
    const plan = dryRun(fixture, "bloqueado");
    expect(plan.bloqueos).toEqual([]);
    expect(plan.ambiguos.length).toBeGreaterThan(0);
    const menu = plan.mappings.find((m) => m.legacyKey === "sistema-gestion-menu-v1");
    expect(menu).toMatchObject({ owner: "menu", registros: 2 });
    const clientes = plan.mappings.find((m) => m.legacyKey === "sistema-gestion-data-v1.clientes");
    expect(clientes).toMatchObject({ owner: "clientes", registros: 2 });
  });
  it("reporta ambiguos y los excluye del plan aplicable", () => {
    const plan = dryRun(fixture, "bloqueado");
    const ambiguo = plan.ambiguos.find((a) => a.legacyKey === "sistema-gestion-stock-category-order-v1");
    expect(ambiguo?.candidatos).toEqual(["categorias", "productos"]);
    expect(plan.mappings.some((m) => m.legacyKey === "sistema-gestion-stock-category-order-v1")).toBe(false);
  });
  it("secreto detectado bloquea todo sin mutar stores", async () => {
    const dump = { ...fixture, "sistema-gestion-current-user-v1": { username: "syn", loginToken: "syn-marker" } };
    const before = await hashStores();
    const plan = dryRun(dump, "bloqueado");
    expect(plan.mappings).toEqual([]);
    expect(plan.ambiguos).toEqual([]);
    expect(plan.bloqueos.map((b) => b.legacyKey)).toEqual(["sistema-gestion-current-user-v1"]);
    const response = await POST(request(adminCookie, "POST", { legacyDump: dump }));
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error: { details: { keys: string[] } } };
    expect(payload.error.details.keys).toEqual(["sistema-gestion-current-user-v1"]);
    expect(JSON.stringify(payload)).not.toContain("syn-marker");
    expect(await hashStores()).toBe(before);
  });
  it("usa el fixture por defecto con body vacio sin mutar estado", async () => {
    const beforeState = await readFile(join(directory, "migration-state.json"), "utf8");
    const response = await POST(request(adminCookie, "POST"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean; data: { mappings: unknown[]; estado: string } };
    expect(payload.ok).toBe(true);
    expect(payload.data.mappings.length).toBeGreaterThan(0);
    expect(payload.data.estado).toBe("bloqueado");
    expect(await readFile(join(directory, "migration-state.json"), "utf8")).toBe(beforeState);
  });
  it("exige admin: 401 sin sesion y 403 vendedor", async () => {
    expect((await POST(request(undefined, "POST", { legacyDump: fixture }))).status).toBe(401);
    expect((await POST(request(sellerCookie, "POST", { legacyDump: fixture }))).status).toBe(403);
  });
  it("cutover bloqueado: otras operaciones responden 403 fijo", async () => {
    for (const response of [await GET(), await DELETE()]) {
      expect(response.status).toBe(403);
      const payload = (await response.json()) as { error: { message: string } };
      expect(payload.error.message).toBe("cutover bloqueado por spec");
    }
  });
});
