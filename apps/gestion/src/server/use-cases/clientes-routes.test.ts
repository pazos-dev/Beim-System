import { readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listClientes, POST as createCliente } from "../../../app/api/gestion/clientes/route";
import {
  DELETE as removeCliente,
  GET as getCliente,
  PATCH as patchCliente,
  PUT as putCliente
} from "../../../app/api/gestion/clientes/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let sellerCookie = "";
let adminCookie = "";
let technicianCookie = "";

function clientesRequest(cookie: string | undefined, url = "http://localhost/api/gestion/clientes"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
}

function clienteByIdRequest(cookie: string | undefined, id: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost/api/gestion/clientes/${id}`, { headers });
}

function mutationRequest(
  cookie: string | undefined,
  url: string,
  method: string,
  body: unknown,
  key: string | undefined
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest(url, { method, headers, body: JSON.stringify(body) });
}

function freshKey(): string {
  return `key-${randomUUID()}`;
}

async function auditEventCount(target: string): Promise<number> {
  const raw = await readFile(join(target, "audit.json"), "utf8");
  return (JSON.parse(raw) as { events: unknown[] }).events.length;
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("/api/gestion/clientes GET routes (CLI-5)", () => {
  it("rejects listing and detail without a session (401)", async () => {
    const listed = await listClientes(clientesRequest(undefined));
    expect(listed.status).toBe(401);
    expect(await listed.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    const found = await getCliente(clienteByIdRequest(undefined, "c_1"), {
      params: Promise.resolve({ id: "c_1" })
    });
    expect(found.status).toBe(401);
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await listClientes(
      clientesRequest(sellerCookie, "http://localhost/api/gestion/clientes?role=administrador")
    );
    expect(forged.status).toBe(200);
    const unauthenticated = await listClientes(
      clientesRequest(undefined, "http://localhost/api/gestion/clientes?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists paginated clientes with the envelope contract", async () => {
    const response = await listClientes(clientesRequest(adminCookie));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: unknown[]; page: number; pageSize: number; totalItems: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(25);
    expect(body.data.totalItems).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(body)).not.toMatch(/ownerId/);
  });

  it("returns 404 for unknown cliente ids", async () => {
    const response = await getCliente(clienteByIdRequest(adminCookie, "missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    expect(response.status).toBe(404);
  });

  it("exposes the entity version as ETag on GET detail", async () => {
    const response = await getCliente(clienteByIdRequest(adminCookie, "c_1"), {
      params: Promise.resolve({ id: "c_1" })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('W/"v1"');
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-clientes-routes-");
  process.env.GESTION_DATA_DIR = directory;
  sellerCookie = await loginAs("vendedor");
  adminCookie = await loginAs("administrador");
  technicianCookie = await loginAs("tecnico");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});

describe("POST /api/gestion/clientes (CLI-7/CLI-8)", () => {
  it("creates with 201 and records one audit entry", async () => {
    const before = await auditEventCount(directory);
    const response = await createCliente(
      mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
        displayName: "Route Cliente"
      }, freshKey())
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      ok: boolean;
      data: { cliente: { id: string; displayName: string }; duplicateWarning?: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.cliente.displayName).toBe("Route Cliente");
    expect(body.data.duplicateWarning).toBeUndefined();
    expect(await auditEventCount(directory)).toBe(before + 1);
  });

  it("returns 201 with duplicateWarning on colliding email", async () => {
    const target = await createSeedDirectory("gestion-clientes-route-dup-");
    const previous = process.env.GESTION_DATA_DIR;
    process.env.GESTION_DATA_DIR = target;
    try {
      const first = await createCliente(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
          displayName: "Ana",
          email: "ana@mail.com"
        }, freshKey())
      );
      expect(first.status).toBe(201);
      const second = await createCliente(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
          displayName: "Ana bis",
          email: "ANA@mail.com"
        }, freshKey())
      );
      expect(second.status).toBe(201);
      const body = (await second.json()) as {
        ok: boolean;
        data: { duplicateWarning?: string };
      };
      expect(body.data.duplicateWarning).toBe("email");
    } finally {
      if (previous === undefined) delete process.env.GESTION_DATA_DIR;
      else process.env.GESTION_DATA_DIR = previous;
      await rm(target, { force: true, recursive: true });
    }
  });

  it("pins 400 on invalid bodies and missing keys with no audit", async () => {
    const before = await auditEventCount(directory);
    for (const payload of [{}, { displayName: "" }, { displayName: "X", email: "bad" }]) {
      const response = await createCliente(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", payload, freshKey())
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" }
      });
    }
    const noKey = await createCliente(
      mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
        displayName: "Sin clave"
      }, undefined)
    );
    expect(noKey.status).toBe(400);
    expect(await auditEventCount(directory)).toBe(before);
  });

  it("pins 401 without a session and 403 for non-writers with no audit", async () => {
    const before = await auditEventCount(directory);
    const unauthenticated = await createCliente(
      mutationRequest(undefined, "http://localhost/api/gestion/clientes", "POST", {
        displayName: "Anon"
      }, freshKey())
    );
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    // The 401 is audited by AuthService itself (auth.session); the mutation never runs.
    const afterAuthDeny = await auditEventCount(directory);
    expect(afterAuthDeny).toBe(before + 1);
    const forbidden = await createCliente(
      mutationRequest(technicianCookie, "http://localhost/api/gestion/clientes", "POST", {
        displayName: "Tecnico"
      }, freshKey())
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" }
    });
    expect(await auditEventCount(directory)).toBe(afterAuthDeny);
  });

  it("replays the same key with one entry and conflicts on payload mismatch", async () => {
    const key = freshKey();
    const before = await auditEventCount(directory);
    const first = await createCliente(
      mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
        displayName: "Replay route"
      }, key)
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { data: { cliente: { id: string } } };
    const replay = await createCliente(
      mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
        displayName: "Replay route"
      }, key)
    );
    expect(replay.status).toBe(201);
    const replayBody = (await replay.json()) as { data: { cliente: { id: string } } };
    expect(replayBody.data.cliente.id).toBe(firstBody.data.cliente.id);
    expect(await auditEventCount(directory)).toBe(before + 1);
    const mismatch = await createCliente(
      mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
        displayName: "Otro nombre"
      }, key)
    );
    expect(mismatch.status).toBe(409);
    expect(await mismatch.json()).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" }
    });
    expect(await auditEventCount(directory)).toBe(before + 2);
  });

  it("pins 500 on storage and audit failures", async () => {
    const brokenData = await createSeedDirectory("gestion-clientes-route-500-data-");
    const brokenAudit = await createSeedDirectory("gestion-clientes-route-500-audit-");
    const previous = process.env.GESTION_DATA_DIR;
    try {
      await writeFile(join(brokenData, "clientes.json"), "not-json", "utf8");
      process.env.GESTION_DATA_DIR = brokenData;
      const beforeData = await auditEventCount(brokenData);
      const storage = await createCliente(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
          displayName: "Roto"
        }, freshKey())
      );
      expect(storage.status).toBe(500);
      expect(await storage.json()).toMatchObject({
        ok: false,
        error: { code: "STORAGE_ERROR" }
      });
      expect(await auditEventCount(brokenData)).toBe(beforeData + 1);

      await writeFile(join(brokenAudit, "audit.json"), "not-json", "utf8");
      process.env.GESTION_DATA_DIR = brokenAudit;
      const failed = await createCliente(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes", "POST", {
          displayName: "Sin auditoria"
        }, freshKey())
      );
      expect(failed.status).toBe(500);
      expect(await failed.json()).toMatchObject({
        ok: false,
        error: { code: "AUDIT_FAILURE" }
      });
    } finally {
      if (previous === undefined) delete process.env.GESTION_DATA_DIR;
      else process.env.GESTION_DATA_DIR = previous;
      await rm(brokenData, { force: true, recursive: true });
      await rm(brokenAudit, { force: true, recursive: true });
    }
  });
});

describe("PATCH/PUT/DELETE /api/gestion/clientes/[id] (CLI-7/CLI-8)", () => {
  it("patches with 200 and audits once", async () => {
    const target = await createSeedDirectory("gestion-clientes-route-patch-");
    const previous = process.env.GESTION_DATA_DIR;
    process.env.GESTION_DATA_DIR = target;
    try {
      const before = await auditEventCount(target);
      const response = await patchCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/c_2", "PATCH", {
          expectedVersion: 1,
          phone: "555-2"
        }, freshKey()),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; data: { phone?: string; version: number } };
      expect(body.data.phone).toBe("555-2");
      expect(body.data.version).toBe(2);
      expect(await auditEventCount(target)).toBe(before + 1);
    } finally {
      if (previous === undefined) delete process.env.GESTION_DATA_DIR;
      else process.env.GESTION_DATA_DIR = previous;
      await rm(target, { force: true, recursive: true });
    }
  });

  it("supports PUT as an update alias", async () => {
    const target = await createSeedDirectory("gestion-clientes-route-put-");
    const previous = process.env.GESTION_DATA_DIR;
    process.env.GESTION_DATA_DIR = target;
    try {
      const response = await putCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/c_2", "PUT", {
          expectedVersion: 1,
          phone: "555-7"
        }, freshKey()),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; data: { phone?: string; version: number } };
      expect(body.data.phone).toBe("555-7");
      expect(body.data.version).toBe(2);
    } finally {
      if (previous === undefined) delete process.env.GESTION_DATA_DIR;
      else process.env.GESTION_DATA_DIR = previous;
      await rm(target, { force: true, recursive: true });
    }
  });

  it("pins the PATCH error matrix with exact codes", async () => {
    const target = await createSeedDirectory("gestion-clientes-route-patch-matrix-");
    const previous = process.env.GESTION_DATA_DIR;
    process.env.GESTION_DATA_DIR = target;
    try {
      const before = await auditEventCount(target);
      const stale = await patchCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/c_2", "PATCH", {
          expectedVersion: 999,
          phone: "555-0"
        }, freshKey()),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      expect(await auditEventCount(target)).toBe(before + 1);

      const unknown = await patchCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/missing", "PATCH", {
          expectedVersion: 0,
          phone: "555-0"
        }, freshKey()),
        { params: Promise.resolve({ id: "missing" }) }
      );
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toMatchObject({
        ok: false,
        error: { code: "NOT_FOUND_OR_FORBIDDEN" }
      });

      const forbidden = await patchCliente(
        mutationRequest(technicianCookie, "http://localhost/api/gestion/clientes/c_2", "PATCH", {
          expectedVersion: 1,
          phone: "555-0"
        }, freshKey()),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(forbidden.status).toBe(403);

      const unauthenticated = await patchCliente(
        mutationRequest(undefined, "http://localhost/api/gestion/clientes/c_2", "PATCH", {
          expectedVersion: 1,
          phone: "555-0"
        }, freshKey()),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(unauthenticated.status).toBe(401);
      // AuthService audits its own session denial; the mutation never runs.
      expect(await auditEventCount(target)).toBe(before + 3);

      for (const payload of [
        { phone: "555-0" },
        { expectedVersion: "1", phone: "555-0" },
        { expectedVersion: 1, email: "bad" }
      ]) {
        const invalid = await patchCliente(
          mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/c_2", "PATCH", payload, freshKey()),
          { params: Promise.resolve({ id: "c_2" }) }
        );
        expect(invalid.status).toBe(400);
        expect(await invalid.json()).toMatchObject({
          ok: false,
          error: { code: "VALIDATION_ERROR" }
        });
      }
      const noKey = await patchCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/c_2", "PATCH", {
          expectedVersion: 1,
          phone: "555-0"
        }, undefined),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(noKey.status).toBe(400);
      expect(await auditEventCount(target)).toBe(before + 3);
    } finally {
      if (previous === undefined) delete process.env.GESTION_DATA_DIR;
      else process.env.GESTION_DATA_DIR = previous;
      await rm(target, { force: true, recursive: true });
    }
  });

  it("deletes as admin, forbids writers, and audits attempts", async () => {
    const target = await createSeedDirectory("gestion-clientes-route-delete-");
    const previous = process.env.GESTION_DATA_DIR;
    process.env.GESTION_DATA_DIR = target;
    try {
      const before = await auditEventCount(target);
      const forbidden = await removeCliente(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/clientes/c_1", "DELETE", {}, freshKey()),
        { params: Promise.resolve({ id: "c_1" }) }
      );
      expect(forbidden.status).toBe(403);
      expect(await forbidden.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

      const unknown = await removeCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/missing", "DELETE", {}, freshKey()),
        { params: Promise.resolve({ id: "missing" }) }
      );
      expect(unknown.status).toBe(404);

      const unauthenticated = await removeCliente(
        mutationRequest(undefined, "http://localhost/api/gestion/clientes/c_2", "DELETE", {}, freshKey()),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(unauthenticated.status).toBe(401);

      const noKey = await removeCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/c_2", "DELETE", {}, undefined),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(noKey.status).toBe(400);

      const removed = await removeCliente(
        mutationRequest(adminCookie, "http://localhost/api/gestion/clientes/c_2", "DELETE", {}, freshKey()),
        { params: Promise.resolve({ id: "c_2" }) }
      );
      expect(removed.status).toBe(200);
      // +1 unknown-id attempt, +1 auth.session denial, +1 hard remove; 403/400 add nothing.
      expect(await auditEventCount(target)).toBe(before + 3);
      const gone = await getCliente(clienteByIdRequest(adminCookie, "c_2"), {
        params: Promise.resolve({ id: "c_2" })
      });
      expect(gone.status).toBe(404);
    } finally {
      if (previous === undefined) delete process.env.GESTION_DATA_DIR;
      else process.env.GESTION_DATA_DIR = previous;
      await rm(target, { force: true, recursive: true });
    }
  });
});
