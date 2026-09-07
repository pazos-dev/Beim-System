import { rm } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as estadoCaja, POST as moverCaja } from "../../../app/api/gestion/caja/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let cajaCookie = "";
let vendedorCookie = "";
let tecnicoCookie = "";

function request(
  url: string,
  cookie: string | undefined,
  init?: { method?: string; body?: string; headers?: Record<string, string> }
): NextRequest {
  const headers = new Headers(init?.headers);
  if (cookie !== undefined) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(url, { ...init, headers });
}

function postAbrir(cookie: string | undefined, body: unknown, key?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return request("http://localhost/api/gestion/caja", cookie, {
    method: "POST",
    body: JSON.stringify(body),
    headers
  });
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("GET /api/gestion/caja (CJA-1)", () => {
  it("rejects estado without a session (401)", async () => {
    const response = await estadoCaja(request("http://localhost/api/gestion/caja", undefined));
    expect(response.status).toBe(401);
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await estadoCaja(
      request("http://localhost/api/gestion/caja?role=administrador", cajaCookie)
    );
    expect(forged.status).toBe(200);
    const unauthenticated = await estadoCaja(
      request("http://localhost/api/gestion/caja?role=administrador", undefined)
    );
    expect(unauthenticated.status).toBe(401);
  });
});

describe("POST /api/gestion/caja abrir (CJA-1/4)", () => {
  it("requires an idempotency key with 400", async () => {
    const response = await moverCaja(postAbrir(cajaCookie, { accion: "abrir", fecha: "2026-03-01", apertura: 100 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects forbidden roles with zero writes and no audit", async () => {
    const before = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(directory, "sesiones-caja.json"), "utf8").catch(() => "[]")
    );
    for (const cookie of [vendedorCookie, tecnicoCookie]) {
      const response = await moverCaja(
        postAbrir(cookie, { accion: "abrir", fecha: "2026-03-01", apertura: 100 }, "route-forbidden-1")
      );
      expect(response.status).toBe(403);
    }
    const after = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(directory, "sesiones-caja.json"), "utf8").catch(() => "[]")
    );
    expect(after).toBe(before);
  });

  it("opens once (201), replays the same key, and blocks a second opening (409 audited)", async () => {
    const first = await moverCaja(
      postAbrir(cajaCookie, { accion: "abrir", fecha: "2026-03-02", apertura: 1000 }, "route-open-1")
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { ok: boolean; data: { id: string } };
    const replay = await moverCaja(
      postAbrir(cajaCookie, { accion: "abrir", fecha: "2026-03-02", apertura: 1000 }, "route-open-1")
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual({ ok: true, data: firstBody.data });
    const estado = await estadoCaja(request("http://localhost/api/gestion/caja", cajaCookie));
    expect(estado.status).toBe(200);
    const estadoBody = (await estado.json()) as {
      ok: boolean;
      data: { abierta: boolean; esperado: number; gastosDia: { count: number; total: number } };
    };
    expect(estadoBody.data.abierta).toBe(true);
    const second = await moverCaja(
      postAbrir(cajaCookie, { accion: "abrir", fecha: "2026-03-02", apertura: 1000 }, "route-open-2")
    );
    expect(second.status).toBe(409);
    const diff = await moverCaja(
      postAbrir(cajaCookie, { accion: "abrir", fecha: "2026-03-02", apertura: 999 }, "route-open-1")
    );
    expect(diff.status).toBe(409);
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-caja-routes-");
  process.env.GESTION_DATA_DIR = directory;
  cajaCookie = await loginAs("caja");
  vendedorCookie = await loginAs("vendedor");
  tecnicoCookie = await loginAs("tecnico");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
