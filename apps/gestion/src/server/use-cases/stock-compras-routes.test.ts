import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as listCompras } from "../../../app/api/gestion/compras/route";
import { GET as getCompra } from "../../../app/api/gestion/compras/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { attachApiBearer } from "../shared/session-store";
import { tokenFromCookie } from "../shared/auth";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
const previousBaseUrl = process.env.BEIM_API_BASE_URL;
const REMOTE_BASE_URL = "http://remote-compras-routes.test";

let directory = "";
let adminCookieWithBearer = "";
let adminCookieWithoutBearer = "";
let sellerCookie = "";

function comprasRequest(cookie: string | undefined, url = "http://localhost/api/gestion/compras"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
}

function compraByIdRequest(cookie: string | undefined, id: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost/api/gestion/compras/${id}`, { headers });
}

function remoteOk(body: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data: body }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

const remoteCompraAndina = {
  id: "co_route_andina",
  ownerId: "u-remote",
  version: 1,
  productoId: "p_remote",
  proveedor: "Proveedor Andina",
  cantidad: 2,
  costoUnitario: 50,
  deposito: "principal",
  comprobante: "FAC-001",
  fecha: "2026-01-10T12:00:00.000Z",
  total: 100
};

const remoteCompraBoreal = {
  id: "co_route_boreal",
  ownerId: "u-remote",
  version: 1,
  productoId: "p_remote",
  proveedor: "Proveedor Boreal",
  cantidad: 1,
  costoUnitario: 70,
  deposito: "principal",
  comprobante: "FAC-002",
  fecha: "2026-01-11T12:00:00.000Z",
  total: 70
};

const remoteProducto = {
  id: "p_remote",
  ownerId: "u-remote",
  version: 1,
  displayName: "Producto remoto",
  price: 1000,
  cost: 600,
  stock: 10,
  minimum: 2,
  active: true
};

describe("GET /api/gestion/compras (remote read route)", () => {
  it("rejects listing and detail without a session (401)", async () => {
    const listed = await listCompras(comprasRequest(undefined));
    expect(listed.status).toBe(401);
    expect(await listed.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    const found = await getCompra(compraByIdRequest(undefined, "co_route_andina"), {
      params: Promise.resolve({ id: "co_route_andina" })
    });
    expect(found.status).toBe(401);
  });

  it("ignores a forged client-side role and enforces the real role", async () => {
    const forged = await listCompras(
      comprasRequest(sellerCookie, "http://localhost/api/gestion/compras?role=administrador")
    );
    expect(forged.status).toBe(403);
    const unauthenticated = await listCompras(
      comprasRequest(undefined, "http://localhost/api/gestion/compras?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists remote history with the envelope contract and filters by proveedor", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === `${REMOTE_BASE_URL}/api/v1/purchases`) {
        return Promise.resolve(remoteOk([remoteCompraAndina, remoteCompraBoreal]));
      }
      if (url === `${REMOTE_BASE_URL}/api/v1/stock`) {
        return Promise.resolve(remoteOk([remoteProducto]));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const response = await listCompras(comprasRequest(adminCookieWithBearer));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: { id: string }[]; page: number; pageSize: number; totalItems: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ page: 1, pageSize: 25, totalItems: 2 });
    expect(JSON.stringify(body)).not.toMatch(/ownerId/);

    const filtered = await listCompras(
      comprasRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras?proveedor=Proveedor%20Andina")
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as { data: { totalItems: number } };
    expect(filteredBody.data.totalItems).toBe(1);

    vi.unstubAllGlobals();
  });

  it("returns 403 with nothing leaked for non-admin readers and 404 for unknown ids", async () => {
    const forbidden = await listCompras(comprasRequest(sellerCookie));
    expect(forbidden.status).toBe(403);
    const forbiddenBody = (await forbidden.json()) as { ok: boolean; error: { code: string } };
    expect(forbiddenBody).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(JSON.stringify(forbiddenBody)).not.toMatch(/Proveedor/);

    const forbiddenDetail = await getCompra(compraByIdRequest(sellerCookie, "co_route_andina"), {
      params: Promise.resolve({ id: "co_route_andina" })
    });
    expect(forbiddenDetail.status).toBe(403);

    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url.includes("co_route_andina")) {
        return Promise.resolve(remoteOk(remoteCompraAndina));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const missing = await getCompra(compraByIdRequest(adminCookieWithBearer, "missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    expect(missing.status).toBe(404);

    const found = await getCompra(compraByIdRequest(adminCookieWithBearer, "co_route_andina"), {
      params: Promise.resolve({ id: "co_route_andina" })
    });
    expect(found.status).toBe(200);

    vi.unstubAllGlobals();
  });

  it("returns 400 for invalid list queries", async () => {
    const response = await listCompras(comprasRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras?page=0"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" }
    });
  });

  it("returns 503 when the session has no API bearer", async () => {
    const response = await listCompras(comprasRequest(adminCookieWithoutBearer));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(body.error.message).toMatch(/^Próxima implementación:/);
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-compras-routes-");
  process.env.GESTION_DATA_DIR = directory;
  process.env.BEIM_API_BASE_URL = REMOTE_BASE_URL;

  await writeFile(join(directory, "productos.json"), "not-json", "utf8");
  await writeFile(join(directory, "movimientos-stock.json"), "not-json", "utf8");
  await writeFile(join(directory, "compras.json"), "not-json", "utf8");

  adminCookieWithBearer = await loginAs("administrador");
  adminCookieWithoutBearer = await loginAs("administrador_principal");
  sellerCookie = await loginAs("vendedor");

  const token = tokenFromCookie(adminCookieWithBearer);
  if (token === null) throw new Error("Expected a session token.");
  attachApiBearer(token, { token: "remote-bearer", expiresAtMs: Date.now() + 3600000 });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  if (previousBaseUrl === undefined) delete process.env.BEIM_API_BASE_URL;
  else process.env.BEIM_API_BASE_URL = previousBaseUrl;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
