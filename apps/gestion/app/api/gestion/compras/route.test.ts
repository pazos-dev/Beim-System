import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as listCompras, POST as createCompra } from "./route";
import { GET as getCompra, PATCH as patchCompra } from "./[id]/route";
import { AuthService, clearSessionsForTests } from "../../../../src/server/handlers/auth";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { attachApiBearer } from "../../../../src/server/shared/session-store";
import { tokenFromCookie } from "../../../../src/server/shared/auth";
import { createSeedDirectory } from "../../../../src/test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
const previousBaseUrl = process.env.BEIM_API_BASE_URL;
const REMOTE_BASE_URL = "http://remote-compras.test";

let directory = "";
let adminCookieWithBearer = "";
let adminCookieWithoutBearer = "";
let sellerCookie = "";
let technicianCookie = "";

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

describe("/api/gestion/compras remote read and explicit mutation routes", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-compras-remote-routes-");
    process.env.GESTION_DATA_DIR = directory;
    process.env.BEIM_API_BASE_URL = REMOTE_BASE_URL;

    // Corrupt local entity files so any accidental JSON read fails loudly.
    await writeFile(join(directory, "productos.json"), "not-json", "utf8");
    await writeFile(join(directory, "movimientos-stock.json"), "not-json", "utf8");
    await writeFile(join(directory, "compras.json"), "not-json", "utf8");

    adminCookieWithBearer = await loginAs("administrador");
    adminCookieWithoutBearer = await loginAs("administrador_principal");
    sellerCookie = await loginAs("vendedor");
    technicianCookie = await loginAs("tecnico");

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
    const { rm } = await import("node:fs/promises");
    await rm(directory, { force: true, recursive: true });
  });

  it("uses an isolated temp directory instead of the repository data directory", () => {
    const repositoryDataDirectory = join(process.cwd(), "data");
    expect(directory).not.toBe(repositoryDataDirectory);
    expect(directory.startsWith(tmpdir())).toBe(true);
    expect(process.env.GESTION_DATA_DIR).toBe(directory);
    expect(process.env.GESTION_DATA_DIR).not.toBe(repositoryDataDirectory);
  });

  const remoteCompraAndina = {
    id: "co_andina",
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
    id: "co_boreal",
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

  describe("GET /api/gestion/compras", () => {
    it("rejects unauthenticated requests with 401 before checking the API bearer", async () => {
      const response = await listCompras(comprasRequest(undefined));

      expect(response.status).toBe(401);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("returns 503 next-implementation when the session has no API bearer", async () => {
      const response = await listCompras(comprasRequest(adminCookieWithoutBearer));

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
    });

    it("reads from the remote repository and does not touch the local JSON file", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url === `${REMOTE_BASE_URL}/api/v1/purchases`) {
          return Promise.resolve(remoteOk([remoteCompraAndina, remoteCompraBoreal]));
        }
        if (url === `${REMOTE_BASE_URL}/api/v1/stock`) {
          return Promise.resolve(
            remoteOk([
              {
                id: "p_remote",
                ownerId: "u-remote",
                version: 1,
                displayName: "Producto remoto",
                price: 1000,
                cost: 600,
                stock: 10,
                minimum: 2,
                active: true
              }
            ])
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), { status: 404 }));
      });
      vi.stubGlobal("fetch", fetchSpy);

      const response = await listCompras(comprasRequest(adminCookieWithBearer));

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        data: { items: { id: string }[]; totalItems: number };
      };
      expect(body.ok).toBe(true);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.items[0]?.id).toBe("co_andina");
      expect(body.data.totalItems).toBe(2);
      expect(JSON.stringify(body)).not.toMatch(/ownerId/);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const calls = fetchSpy.mock.calls as [string, { method: string; headers: Record<string, string> }][];
      const purchasesCall = calls.find(([url]) => url === `${REMOTE_BASE_URL}/api/v1/purchases`);
      expect(purchasesCall).toBeDefined();
      expect(purchasesCall?.[1].method).toBe("GET");
      expect(purchasesCall?.[1].headers.Authorization).toBe("Bearer remote-bearer");
      vi.unstubAllGlobals();
    });

    it("preserves query parsing, filtering and pagination on remote data", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url === `${REMOTE_BASE_URL}/api/v1/purchases`) {
          return Promise.resolve(remoteOk([remoteCompraAndina, remoteCompraBoreal]));
        }
        if (url === `${REMOTE_BASE_URL}/api/v1/stock`) {
          return Promise.resolve(
            remoteOk([
              {
                id: "p_remote",
                ownerId: "u-remote",
                version: 1,
                displayName: "Producto remoto",
                price: 1000,
                cost: 600,
                stock: 10,
                minimum: 2,
                active: true
              }
            ])
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), { status: 404 }));
      });
      vi.stubGlobal("fetch", fetchSpy);

      const response = await listCompras(
        comprasRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras?proveedor=Proveedor%20Andina")
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; data: { items: unknown[]; totalItems: number } };
      expect(body.ok).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.totalItems).toBe(1);
      vi.unstubAllGlobals();
    });

    it("returns 403 with nothing leaked for non-admin readers", async () => {
      const response = await listCompras(comprasRequest(sellerCookie));

      expect(response.status).toBe(403);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(JSON.stringify(body)).not.toMatch(/Proveedor/);
    });

    it("returns 400 for invalid list queries", async () => {
      const response = await listCompras(
        comprasRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras?page=0")
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    });

    it("fails closed on network failure", async () => {
      vi.stubGlobal("fetch", () => Promise.reject(new Error("connection refused")));

      const response = await listCompras(comprasRequest(adminCookieWithBearer));

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      vi.unstubAllGlobals();
    });

    it("fails closed on a malformed remote response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          remoteOk([{ id: "co_bad" }]) // does not satisfy compraSchema
        )
      );

      const response = await listCompras(comprasRequest(adminCookieWithBearer));

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      vi.unstubAllGlobals();
    });
  });

  describe("GET /api/gestion/compras/[id]", () => {
    it("returns 503 next-implementation when the session has no API bearer", async () => {
      const response = await getCompra(compraByIdRequest(adminCookieWithoutBearer, "co_andina"), {
        params: Promise.resolve({ id: "co_andina" })
      });

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    });

    it("returns 403 for non-admin readers", async () => {
      const response = await getCompra(compraByIdRequest(sellerCookie, "co_andina"), {
        params: Promise.resolve({ id: "co_andina" })
      });

      expect(response.status).toBe(403);
      expect((await response.json()).ok).toBe(false);
    });

    it("reads a compra from the remote repository", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(remoteOk(remoteCompraAndina));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await getCompra(compraByIdRequest(adminCookieWithBearer, "co_andina"), {
        params: Promise.resolve({ id: "co_andina" })
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; data: { id: string } };
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe("co_andina");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0] as [string, unknown];
      expect(url).toBe(`${REMOTE_BASE_URL}/api/v1/purchases/co_andina`);
      vi.unstubAllGlobals();
    });

    it("returns 404 for unknown ids", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
      vi.stubGlobal("fetch", fetchSpy);

      const response = await getCompra(compraByIdRequest(adminCookieWithBearer, "missing"), {
        params: Promise.resolve({ id: "missing" })
      });

      expect(response.status).toBe(404);
      vi.unstubAllGlobals();
    });
  });

  describe("POST /api/gestion/compras", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await createCompra(
        mutationRequest(undefined, "http://localhost/api/gestion/compras", "POST", { productoId: "p_1", cantidad: 1, costoUnitario: 50, proveedor: "X" }, "key-1")
      );

      expect(response.status).toBe(401);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 403 for roles that cannot write compras", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const sellerResponse = await createCompra(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/compras", "POST", { productoId: "p_1", cantidad: 1, costoUnitario: 50, proveedor: "X" }, "key-1")
      );
      expect(sellerResponse.status).toBe(403);

      const technicianResponse = await createCompra(
        mutationRequest(technicianCookie, "http://localhost/api/gestion/compras", "POST", { productoId: "p_1", cantidad: 1, costoUnitario: 50, proveedor: "X" }, "key-1")
      );
      expect(technicianResponse.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("returns 403 for an unauthorized role even when the idempotency key is missing", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await createCompra(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/compras", "POST", { productoId: "p_1", cantidad: 1, costoUnitario: 50, proveedor: "X" }, undefined)
      );

      expect(response.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("returns 400 for an invalid payload", async () => {
      const response = await createCompra(
        mutationRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras", "POST", { productoId: "p_1", cantidad: 1 }, "key-1")
      );

      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 400 when the idempotency key is missing", async () => {
      const response = await createCompra(
        mutationRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras", "POST", { productoId: "p_1", cantidad: 1, costoUnitario: 50, proveedor: "X" }, undefined)
      );

      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 503 next-implementation for an authorized writer and does not call fetch or write local JSON", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);
      const before = await readFile(join(directory, "compras.json"), "utf8");

      const response = await createCompra(
        mutationRequest(
          adminCookieWithBearer,
          "http://localhost/api/gestion/compras",
          "POST",
          { productoId: "p_1", cantidad: 1, costoUnitario: 50, proveedor: "Proveedor Remoto", comprobante: "FAC-R" },
          "key-1"
        )
      );

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await readFile(join(directory, "compras.json"), "utf8")).toBe(before);
      vi.unstubAllGlobals();
    });
  });

  describe("PATCH /api/gestion/compras/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await patchCompra(
        mutationRequest(undefined, "http://localhost/api/gestion/compras/co_1", "PATCH", { motivo: "Anulación" }, "key-1"),
        { params: Promise.resolve({ id: "co_1" }) }
      );

      expect(response.status).toBe(401);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 403 for roles that cannot write compras", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await patchCompra(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/compras/co_1", "PATCH", { motivo: "Anulación" }, "key-1"),
        { params: Promise.resolve({ id: "co_1" }) }
      );

      expect(response.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("returns 403 for an unauthorized role even when the idempotency key is missing", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await patchCompra(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/compras/co_1", "PATCH", { motivo: "Anulación" }, undefined),
        { params: Promise.resolve({ id: "co_1" }) }
      );

      expect(response.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("returns 400 for an invalid payload", async () => {
      const response = await patchCompra(
        mutationRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras/co_1", "PATCH", {}, "key-1"),
        { params: Promise.resolve({ id: "co_1" }) }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 400 when the idempotency key is missing", async () => {
      const response = await patchCompra(
        mutationRequest(adminCookieWithBearer, "http://localhost/api/gestion/compras/co_1", "PATCH", { motivo: "Anulación" }, undefined),
        { params: Promise.resolve({ id: "co_1" }) }
      );

      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 503 next-implementation for an authorized writer and does not call fetch or write local JSON", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);
      const before = await readFile(join(directory, "compras.json"), "utf8");

      const response = await patchCompra(
        mutationRequest(
          adminCookieWithBearer,
          "http://localhost/api/gestion/compras/co_1",
          "PATCH",
          { motivo: "Anulación por defecto" },
          "key-1"
        ),
        { params: Promise.resolve({ id: "co_1" }) }
      );

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await readFile(join(directory, "compras.json"), "utf8")).toBe(before);
      vi.unstubAllGlobals();
    });
  });
});
