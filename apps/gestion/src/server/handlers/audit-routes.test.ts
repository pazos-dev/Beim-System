import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as readAudit } from "../../../app/api/gestion/audit/route";
import { POST as loginRoute } from "../../../app/api/gestion/auth/login/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const CONSOLE_BASE_URL = "http://console-audit-test:4000";
const CONSOLE_BEARER = "console-bearer-audit-1";

function auditRequest(url: string, cookie: string | undefined): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(url, { headers });
}

function loginRequest(username: string): NextRequest {
  return new NextRequest("http://localhost/api/gestion/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, credential: `dev-${username}` })
  });
}

function consoleLoginOk(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        token: CONSOLE_BEARER,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        user: { id: "c-1", username: "administrador", name: "Admin", role: "admin" }
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function remoteAuditOk(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        items: [
          {
            id: "r_1",
            actorUserId: "user-9",
            action: "venta.create",
            entity: "venta",
            entityId: null,
            timestamp: "2026-03-02T10:00:00.000Z",
            result: "ok",
            details: {}
          }
        ],
        total: 1
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function seedLocalAudit(directory: string): Promise<void> {
  await writeFile(
    join(directory, "audit.json"),
    JSON.stringify({
      version: 1,
      events: [
        {
          id: "a_1",
          actorId: "user-1",
          accion: "venta.create",
          entidad: "venta",
          entidadId: null,
          instante: "2026-03-01T10:00:00.000Z",
          resultado: "ok",
          detalles: {}
        },
        {
          id: "a_2",
          actorId: "user-2",
          accion: "caja.abrir",
          entidad: "caja",
          entidadId: null,
          instante: "2026-03-05T10:00:00.000Z",
          resultado: "ok",
          detalles: {}
        }
      ]
    })
  );
}

async function localCookie(username: string): Promise<string> {
  const service = new AuthService(process.env.GESTION_DATA_DIR as string);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

// Local logins append auth events to audit.json, so cookies are minted
// before (re)seeding the local audit fixture in every setup step.
async function refreshLocalState(): Promise<void> {
  clearSessionsForTests();
  adminCookie = await localCookie("administrador");
  vendedorCookie = await localCookie("vendedor");
  await seedLocalAudit(directory);
}

const previousDataDir = process.env.GESTION_DATA_DIR;
const previousConsoleBase = process.env.BEIM_API_BASE_URL;
let directory = "";
let adminCookie = "";
let vendedorCookie = "";

describe("GET /api/gestion/audit", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-audit-route-");
    process.env.GESTION_DATA_DIR = directory;
    process.env.BEIM_API_BASE_URL = CONSOLE_BASE_URL;
    await refreshLocalState();
  });

  afterAll(async () => {
    if (previousDataDir === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDir;
    if (previousConsoleBase === undefined) delete process.env.BEIM_API_BASE_URL;
    else process.env.BEIM_API_BASE_URL = previousConsoleBase;
    clearSessionsForTests();
    vi.unstubAllGlobals();
    await rm(directory, { force: true, recursive: true });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await refreshLocalState();
  });

  it("rejects audit reads without a session cookie", async () => {
    const response = await readAudit(auditRequest("http://localhost/api/gestion/audit", undefined));
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(response.status).toBe(401);
    expect(body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("denies non-admin roles", async () => {
    const response = await readAudit(auditRequest("http://localhost/api/gestion/audit", vendedorCookie));
    const body = (await response.json()) as { ok: boolean; error: { code: string } };
    expect(response.status).toBe(403);
    expect(body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects invalid query params with VALIDATION_ERROR", async () => {
    for (const query of ["?page=0", "?limit=abc", "?limit=5000", "?page=1.5"]) {
      const response = await readAudit(auditRequest(`http://localhost/api/gestion/audit${query}`, adminCookie));
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(response.status).toBe(400);
      expect(body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
  });

  it("reads local audit records when no console bearer exists", async () => {
    const response = await readAudit(auditRequest("http://localhost/api/gestion/audit", adminCookie));
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: Array<{ id: string }>; total: number };
    };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(2);
    expect(body.data.items.map((item) => item.id).sort()).toEqual(["a_1", "a_2"]);
  });

  it("filters local audit records by actor", async () => {
    const response = await readAudit(auditRequest("http://localhost/api/gestion/audit?actor=user-1", adminCookie));
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: Array<{ id: string }>; total: number };
    };
    expect(response.status).toBe(200);
    expect(body.data.total).toBe(1);
    expect(body.data.items.map((item) => item.id)).toEqual(["a_1"]);
  });

  it("calls the console API with the session bearer when exchanged", async () => {
    vi.stubGlobal("fetch", async () => consoleLoginOk());
    const login = await loginRoute(loginRequest("administrador"));
    expect(login.status).toBe(200);
    const cookie = login.cookies.get(SESSION_COOKIE_NAME)?.value;
    expect(cookie).toBeDefined();

    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return remoteAuditOk();
    });

    const response = await readAudit(auditRequest("http://localhost/api/gestion/audit", cookie));
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: Array<{ id: string; accion: string }>; total: number };
    };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, data: { total: 1 } });
    expect(body.data.items).toMatchObject([{ id: "r_1", accion: "venta.create" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.startsWith(`${CONSOLE_BASE_URL}/api/v1/audit-logs`)).toBe(true);
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${CONSOLE_BEARER}`);
    expect(JSON.stringify(body)).not.toContain(CONSOLE_BEARER);
  });

  it("maps remote failures without leaking the upstream body", async () => {
    vi.stubGlobal("fetch", async () => consoleLoginOk());
    const login = await loginRoute(loginRequest("administrador"));
    const cookie = login.cookies.get(SESSION_COOKIE_NAME)?.value;
    expect(cookie).toBeDefined();

    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ ok: false, secret: "upstream-secret-marker" }), { status: 500 })
    );

    const response = await readAudit(auditRequest("http://localhost/api/gestion/audit", cookie));
    const raw = await response.text();
    expect(response.status).toBe(503);
    expect(raw).toContain("DEPENDENCY_UNAVAILABLE");
    expect(raw).not.toContain("upstream-secret-marker");
  });
});
