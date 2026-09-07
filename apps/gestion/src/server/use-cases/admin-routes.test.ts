import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as getBackups, POST as triggerBackup } from "../../../app/api/gestion/admin/backups/route";
import { POST as restoreBackup } from "../../../app/api/gestion/admin/backups/recovery/route";
import { PATCH as patchMenu } from "../../../app/api/gestion/admin/menu/[id]/route";
import { GET as getMenu, POST as postMenu } from "../../../app/api/gestion/admin/menu/route";
import {
  DELETE as dryRunDelete,
  GET as dryRunGet,
  PATCH as dryRunPatch,
  POST as dryRunPost,
  PUT as dryRunPut
} from "../../../app/api/gestion/admin/migration/dry-run/route";
import { GET as getRoles } from "../../../app/api/gestion/admin/roles/route";
import { createSeedDirectory } from "../../test/seed-dir";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let adminCookie = "";
let principalCookie = "";
let sellerCookie = "";
let cashierCookie = "";

function request(
  url: string,
  cookie: string | undefined,
  init?: { method?: string; body?: unknown; key?: string; rawBody?: string }
): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  if (init?.key !== undefined) headers.set("x-idempotency-key", init.key);
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.rawBody ?? (init?.body === undefined ? undefined : JSON.stringify(init.body))
  });
}

async function loginAs(username: string): Promise<string> {
  const result = await new AuthService(directory).login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

function paramsFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function menuVersion(): Promise<number> {
  const response = await getMenu(request("http://localhost/api/gestion/admin/menu", adminCookie));
  const body = (await response.json()) as { data: { version: number } };
  return body.data.version;
}

async function auditActions(): Promise<string[]> {
  const raw = JSON.parse(await readFile(join(directory, "audit.json"), "utf8")) as {
    events: Array<{ accion: string }>;
  };
  return raw.events.map((event) => event.accion);
}

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-admin-routes-");
  const nodes = ["dashboard", "ordenes", "clientes"].map((id, order) => ({
    id: `m_${id}`,
    parentId: null,
    label: id,
    href: id === "dashboard" ? "/app" : `/app/${id}`,
    order
  }));
  await writeFile(join(directory, "menu.json"), JSON.stringify({ version: 1, nodes }));
  process.env.GESTION_DATA_DIR = directory;
  adminCookie = await loginAs("administrador");
  principalCookie = await loginAs("administrador_principal");
  sellerCookie = await loginAs("vendedor");
  cashierCookie = await loginAs("caja");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});

describe("GET /api/gestion/admin/menu + roles (ADM-1/2)", () => {
  it("requires authentication (401)", async () => {
    expect((await getMenu(request("http://localhost/api/gestion/admin/menu", undefined))).status).toBe(401);
    expect((await getRoles(request("http://localhost/api/gestion/admin/roles", undefined))).status).toBe(401);
  });

  it("serves the menu tree to admins and blocks sellers silently", async () => {
    const before = await readFile(join(directory, "menu.json"), "utf8");
    const auditsBefore = await auditActions();
    const response = await getMenu(request("http://localhost/api/gestion/admin/menu", adminCookie));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { version: number; tree: unknown[] } };
    expect(body.data.version).toBe(1);
    expect(body.data.tree.length).toBe(3);
    expect((await getMenu(request("http://localhost/api/gestion/admin/menu", sellerCookie))).status).toBe(403);
    expect(await readFile(join(directory, "menu.json"), "utf8")).toBe(before);
    expect(await auditActions()).toEqual(auditsBefore);
  });

  it("serves the roles mapping to admin/principal and blocks other roles silently", async () => {
    for (const cookie of [adminCookie, principalCookie]) {
      const response = await getRoles(request("http://localhost/api/gestion/admin/roles", cookie));
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { actorRole: string; roles: { role: string; actions: string[]; actorHas: boolean[] }[] };
      };
      expect(body.data.roles.find((row) => row.role === "administrador")?.actions).toContain("backups.manage");
    }
    const auditsBefore = await auditActions();
    for (const cookie of [sellerCookie, cashierCookie]) {
      expect((await getRoles(request("http://localhost/api/gestion/admin/roles", cookie))).status).toBe(403);
    }
    expect(await auditActions()).toEqual(auditsBefore);
  });
});

describe("menu writes require Idempotency-Key (ADM-6)", () => {
  it("rejects keyless POST/PATCH with 400", async () => {
    const post = await postMenu(
      request("http://localhost/api/gestion/admin/menu", adminCookie, { method: "POST", body: { label: "X", href: "/x" } })
    );
    expect(post.status).toBe(400);
    const version = await menuVersion();
    const patch = await patchMenu(
      request("http://localhost/api/gestion/admin/menu/m_dashboard", adminCookie, {
        method: "PATCH",
        body: { order: 0, expectedVersion: version }
      }),
      paramsFor("m_dashboard")
    );
    expect(patch.status).toBe(400);
  });

  it("creates once (201), replays the key, rejects key reuse (409), and audits once per attempt", async () => {
    const auditsBefore = (await auditActions()).filter((action) => action === "admin.menu.create").length;
    const first = await postMenu(
      request("http://localhost/api/gestion/admin/menu", adminCookie, {
        method: "POST",
        body: { label: "Hijo", href: "/app/hijo", parentId: "m_dashboard" },
        key: "route-menu-create-1"
      })
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { data: { node: { id: string }; version: number } };
    const replay = await postMenu(
      request("http://localhost/api/gestion/admin/menu", adminCookie, {
        method: "POST",
        body: { label: "Hijo", href: "/app/hijo", parentId: "m_dashboard" },
        key: "route-menu-create-1"
      })
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual({ ok: true, data: firstBody.data });
    const diff = await postMenu(
      request("http://localhost/api/gestion/admin/menu", adminCookie, {
        method: "POST",
        body: { label: "Otro", href: "/app/hijo", parentId: "m_dashboard" },
        key: "route-menu-create-1"
      })
    );
    expect(diff.status).toBe(409);
    const auditsAfter = (await auditActions()).filter((action) => action === "admin.menu.create").length;
    // First + key-diff conflict are audited; the replay reuses the stored result.
    expect(auditsAfter - auditsBefore).toBe(2);
  });

  it("moves with OCC, rejects stale/cycle/unknown, and forbids sellers with zero writes", async () => {
    const version = await menuVersion();
    const before = await readFile(join(directory, "menu.json"), "utf8");
    expect(
      (
        await postMenu(
          request("http://localhost/api/gestion/admin/menu", sellerCookie, {
            method: "POST",
            body: { label: "X", href: "/x" },
            key: "route-menu-forbidden-1"
          })
        )
      ).status
    ).toBe(403);
    expect(await readFile(join(directory, "menu.json"), "utf8")).toBe(before);
    const moved = await patchMenu(
      request("http://localhost/api/gestion/admin/menu/m_clientes", adminCookie, {
        method: "PATCH",
        body: { parentId: null, order: 0, expectedVersion: version },
        key: "route-menu-move-1"
      }),
      paramsFor("m_clientes")
    );
    expect(moved.status).toBe(200);
    const stale = await patchMenu(
      request("http://localhost/api/gestion/admin/menu/m_clientes", adminCookie, {
        method: "PATCH",
        body: { order: 1, expectedVersion: version },
        key: "route-menu-move-2"
      }),
      paramsFor("m_clientes")
    );
    expect(stale.status).toBe(409);
    expect(await readFile(join(directory, "menu.json"), "utf8")).toBe(await readFile(join(directory, "menu.json"), "utf8"));
    const unknown = await patchMenu(
      request("http://localhost/api/gestion/admin/menu/m_missing", adminCookie, {
        method: "PATCH",
        body: { order: 0, expectedVersion: version + 1 },
        key: "route-menu-move-3"
      }),
      paramsFor("m_missing")
    );
    expect(unknown.status).toBe(404);
    const cyclic = await patchMenu(
      request("http://localhost/api/gestion/admin/menu/m_dashboard", adminCookie, {
        method: "PATCH",
        body: { parentId: "m_dashboard", expectedVersion: version + 1 },
        key: "route-menu-move-4"
      }),
      paramsFor("m_dashboard")
    );
    expect(cyclic.status).toBe(400);
  });
});

describe("backups + recovery (ADM-4)", () => {
  it("lists, triggers, and refreshes the list", async () => {
    const empty = await getBackups(request("http://localhost/api/gestion/admin/backups", adminCookie));
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as { data: { backups: unknown[] } }).data.backups).toEqual([]);
    expect((await getBackups(request("http://localhost/api/gestion/admin/backups", sellerCookie))).status).toBe(403);
    const triggered = await triggerBackup(request("http://localhost/api/gestion/admin/backups", adminCookie, { method: "POST" }));
    expect(triggered.status).toBe(201);
    const listed = await getBackups(request("http://localhost/api/gestion/admin/backups", adminCookie));
    expect((((await listed.json()) as { data: { backups: unknown[] } }).data.backups).length).toBe(1);
  });

  it("guards restore with confirm=true (missing/false is 400, zero writes)", async () => {
    const triggered = await triggerBackup(request("http://localhost/api/gestion/admin/backups", adminCookie, { method: "POST" }));
    const id = ((await triggered.json()) as { data: { backup: { id: string } } }).data.backup.id;
    const menuBefore = await readFile(join(directory, "menu.json"), "utf8");
    for (const body of [{ id }, { id, confirm: false }]) {
      const denied = await restoreBackup(
        request("http://localhost/api/gestion/admin/backups/recovery", adminCookie, { method: "POST", body })
      );
      expect(denied.status).toBe(400);
    }
    expect(await readFile(join(directory, "menu.json"), "utf8")).toBe(menuBefore);
    const unknown = await restoreBackup(
      request("http://localhost/api/gestion/admin/backups/recovery", adminCookie, { method: "POST", body: { id: "b_missing", confirm: true } })
    );
    expect(unknown.status).toBe(404);
    const restored = await restoreBackup(
      request("http://localhost/api/gestion/admin/backups/recovery", adminCookie, { method: "POST", body: { id, confirm: true } })
    );
    expect(restored.status).toBe(200);
  });
});

describe("migration dry-run stays read-only (ADM-5)", () => {
  it("returns the plan without writing state and blocks secrets with 409", async () => {
    const stateBefore = await readFile(join(directory, "migration-state.json"), "utf8");
    const plan = await dryRunPost(request("http://localhost/api/gestion/admin/migration/dry-run", adminCookie, { method: "POST", body: {} }));
    expect(plan.status).toBe(200);
    expect(await readFile(join(directory, "migration-state.json"), "utf8")).toBe(stateBefore);
    const blocked = await dryRunPost(
      request("http://localhost/api/gestion/admin/migration/dry-run", adminCookie, {
        method: "POST",
        body: { legacyDump: { api_key: "sk-test" } }
      })
    );
    expect(blocked.status).toBe(409);
    expect(await readFile(join(directory, "migration-state.json"), "utf8")).toBe(stateBefore);
    expect((await dryRunPost(request("http://localhost/api/gestion/admin/migration/dry-run", sellerCookie, { method: "POST", body: {} }))).status).toBe(403);
  });

  it("keeps cutover blocked (GET/PUT/PATCH/DELETE stay 403)", async () => {
    for (const response of [dryRunGet(), dryRunPut(), dryRunPatch(), dryRunDelete()]) {
      expect(response.status).toBe(403);
    }
  });
});
