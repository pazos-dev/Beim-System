import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listBackupsRoute, POST as createBackupRoute } from "../../../app/api/gestion/admin/backups/route.js";
import { POST as restoreBackupRoute } from "../../../app/api/gestion/admin/backups/[id]/restore/route.js";
import { AuthService, clearSessionsForTests } from "../handlers/auth.js";
import { SESSION_COOKIE_NAME } from "../handlers/session.js";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let adminCookie = "";
let sellerCookie = "";

function routeRequest(cookie: string | undefined, path: string, method: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost${path}`, { method, headers });
}
function paramsFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
async function loginAs(username: string): Promise<string> {
  const result = await new AuthService(directory).login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}
async function createBackupId(): Promise<string> {
  const response = await createBackupRoute(routeRequest(adminCookie, "/api/gestion/admin/backups", "POST"));
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { backup: { id: string } } }).data.backup.id;
}

describe("admin backups slice", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await mkdtemp(join(tmpdir(), "gestion-admin-backups-"));
    await cp(join(process.cwd(), "data"), directory, { recursive: true });
    process.env.GESTION_DATA_DIR = directory;
    sellerCookie = await loginAs("vendedor");
    adminCookie = await loginAs("administrador");
  });
  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
  });
  it("rejects unauthenticated and non-admin actors", async () => {
    expect((await listBackupsRoute(routeRequest(undefined, "/api/gestion/admin/backups", "GET"))).status).toBe(401);
    expect((await createBackupRoute(routeRequest(undefined, "/api/gestion/admin/backups", "POST"))).status).toBe(401);
    expect((await restoreBackupRoute(routeRequest(undefined, "/api/gestion/admin/backups/x/restore", "POST"), paramsFor("x"))).status).toBe(401);
    expect((await createBackupRoute(routeRequest(sellerCookie, "/api/gestion/admin/backups", "POST"))).status).toBe(403);
    await expect(readdir(join(directory, "backups"))).rejects.toThrow();
  });
  it("creates and lists backups with a credential-free manifest", async () => {
    const id = await createBackupId();
    const listed = await listBackupsRoute(routeRequest(adminCookie, "/api/gestion/admin/backups", "GET"));
    expect(listed.status).toBe(200);
    const ids = ((await listed.json()) as { data: { backups: { id: string }[] } }).data.backups.map((backup) => backup.id);
    expect(ids).toContain(id);
    const manifest = await readFile(join(directory, "backups", id, "manifest.json"), "utf8");
    const files = (JSON.parse(manifest) as { files: Record<string, { hash: string }> }).files;
    expect(Object.keys(files)).toHaveLength(12);
    for (const entry of Object.values(files)) expect(entry.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest).not.toContain("credential");
  });
  it("restores backup contents", async () => {
    const id = await createBackupId();
    const clientesPath = join(directory, "clientes.json");
    const wanted = await readFile(join(directory, "backups", id, "clientes.json"), "utf8");
    await writeFile(clientesPath, JSON.stringify({ version: 999, clientes: [] }));
    const restored = await restoreBackupRoute(routeRequest(adminCookie, `/api/gestion/admin/backups/${id}/restore`, "POST"), paramsFor(id));
    expect(restored.status).toBe(200);
    expect(await readFile(clientesPath, "utf8")).toBe(wanted);
  });
  it("rejects corrupt backups without mutating live data", async () => {
    const id = await createBackupId();
    const clientesPath = join(directory, "clientes.json");
    const before = await readFile(clientesPath, "utf8");
    await writeFile(join(directory, "backups", id, "ventas.json"), `${before}\ncorrupt`);
    const restored = await restoreBackupRoute(routeRequest(adminCookie, `/api/gestion/admin/backups/${id}/restore`, "POST"), paramsFor(id));
    expect(restored.status).toBe(400);
    expect(await readFile(clientesPath, "utf8")).toBe(before);
  });
  it("rolls back partial restores", async () => {
    const id = await createBackupId();
    const clientesPath = join(directory, "clientes.json");
    const ventasPath = join(directory, "ventas.json");
    await writeFile(clientesPath, JSON.stringify({ version: 888, clientes: [] }));
    const mutatedClientes = await readFile(clientesPath, "utf8");
    const keptVentas = await readFile(ventasPath, "utf8");
    await mkdir(`${ventasPath}.tmp`);
    const restored = await restoreBackupRoute(routeRequest(adminCookie, `/api/gestion/admin/backups/${id}/restore`, "POST"), paramsFor(id));
    expect(restored.status).toBe(500);
    expect(await readFile(clientesPath, "utf8")).toBe(mutatedClientes);
    expect(await readFile(ventasPath, "utf8")).toBe(keptVentas);
    await rm(`${ventasPath}.tmp`, { force: true, recursive: true });
  });
});
