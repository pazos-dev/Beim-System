import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getMenu, POST as postMenu } from "../../../app/api/gestion/admin/menu/route.js";
import { PATCH as patchMenu } from "../../../app/api/gestion/admin/menu/[id]/route.js";
import { GET as getRoles } from "../../../app/api/gestion/admin/roles/route.js";
import { insertMenuNode, moveMenuNode, type MenuDocument } from "../../lib/domain/admin/menu.js";
import { AuthService, clearSessionsForTests } from "./auth.js";
import { SESSION_COOKIE_NAME } from "./session.js";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let sellerCookie = "";
let adminCookie = "";
const fixture: MenuDocument = {
  version: 2,
  nodes: [
    { id: "a", parentId: null, label: "A", href: "/app", order: 0 },
    { id: "b", parentId: "a", label: "B", href: "/app/b", order: 0 },
    { id: "c", parentId: "b", label: "C", href: "/app/c", order: 0 }
  ]
};
const seedIds = ["dashboard", "ordenes", "clientes", "productos", "ventas", "compras", "servicios", "configuracion"];
function adminRequest(cookie: string | undefined, path: string, method: string, body?: unknown): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
function paramsFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
async function loginAs(username: string): Promise<string> {
  const result = await new AuthService(directory).login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}
describe("admin menu slice", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await mkdtemp(join(tmpdir(), "gestion-admin-menu-"));
    await cp(join(process.cwd(), "data"), directory, { recursive: true });
    const nodes = seedIds.map((id, order) => ({ id: `m_${id}`, parentId: null, label: id, href: id === "dashboard" ? "/app" : `/app/${id}`, order }));
    await writeFile(join(directory, "menu.json"), JSON.stringify({ version: 1, nodes }));
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
  it("rejects direct and indirect cycles without mutating", () => {
    const before = structuredClone(fixture);
    for (const parentId of ["b", "c"]) {
      const rejected = moveMenuNode(fixture, "a", { parentId, expectedVersion: 2 });
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) expect(rejected.error.code).toBe("VALIDATION_ERROR");
    }
    expect(fixture).toEqual(before);
    expect(insertMenuNode(fixture, { label: "", href: "/x" }).ok).toBe(false);
  });
  it("applies valid moves, reorders and rejects stale versions", () => {
    const moved = moveMenuNode(fixture, "c", { parentId: null, order: 1, expectedVersion: 2 });
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.value.version).toBe(3);
      expect(moved.value.nodes.find((node) => node.id === "c")?.parentId).toBeNull();
    }
    const stale = moveMenuNode(fixture, "b", { order: 0, expectedVersion: 1 });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
  });
  it("requires authentication on admin routes", async () => {
    const responses = [
      await getMenu(adminRequest(undefined, "/api/gestion/admin/menu", "GET")),
      await postMenu(adminRequest(undefined, "/api/gestion/admin/menu", "POST", { label: "X", href: "/x" })),
      await patchMenu(adminRequest(undefined, "/api/gestion/admin/menu/a", "PATCH", { expectedVersion: 1 }), paramsFor("a")),
      await getRoles(adminRequest(undefined, "/api/gestion/admin/roles", "GET"))
    ];
    for (const response of responses) expect(response.status).toBe(401);
  });
  it("forbids non-admin roles without mutating menu.json", async () => {
    const before = await readFile(join(directory, "menu.json"), "utf8");
    expect((await postMenu(adminRequest(sellerCookie, "/api/gestion/admin/menu", "POST", { label: "X", href: "/x" }))).status).toBe(403);
    expect((await getRoles(adminRequest(sellerCookie, "/api/gestion/admin/roles", "GET"))).status).toBe(403);
    expect(await readFile(join(directory, "menu.json"), "utf8")).toBe(before);
  });
  it("creates nodes, rejects cycles on PATCH and exposes the role matrix", async () => {
    const created = await postMenu(adminRequest(adminCookie, "/api/gestion/admin/menu", "POST", { label: "Hijo", href: "/app/hijo", parentId: "m_dashboard" }));
    expect(created.status).toBe(201);
    const childId = ((await created.json()) as { data: { node: { id: string } } }).data.node.id;
    const version = ((await (await getMenu(adminRequest(adminCookie, "/api/gestion/admin/menu", "GET"))).json()) as { data: { version: number } }).data.version;
    const cyclic = await patchMenu(adminRequest(adminCookie, "/api/gestion/admin/menu/m_dashboard", "PATCH", { parentId: childId, expectedVersion: version }), paramsFor("m_dashboard"));
    expect(cyclic.status).toBe(400);
    const moved = await patchMenu(adminRequest(adminCookie, `/api/gestion/admin/menu/${childId}`, "PATCH", { parentId: null, order: 0, expectedVersion: version }), paramsFor(childId));
    expect(moved.status).toBe(200);
    const roles = await getRoles(adminRequest(adminCookie, "/api/gestion/admin/roles", "GET"));
    expect(roles.status).toBe(200);
    const rows = ((await roles.json()) as { data: { roles: { role: string; actions: string[]; actorHas: boolean[] }[] } }).data.roles;
    const file = JSON.parse(await readFile(join(directory, "role-permissions.json"), "utf8")) as { permissions: Record<string, string[]> };
    const actorActions = new Set(file.permissions["administrador"]);
    for (const row of rows) {
      expect(row.actions).toEqual(file.permissions[row.role]);
      expect(row.actorHas).toEqual(row.actions.map((action) => actorActions.has(action)));
    }
  });
});
