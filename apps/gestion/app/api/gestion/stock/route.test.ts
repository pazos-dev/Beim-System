import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as listStock } from "./route";
import { POST as postMovimiento } from "./movimientos/route";
import { POST as postTransferencia } from "./transferencias/route";
import { AuthService, clearSessionsForTests } from "../../../../src/server/handlers/auth";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { attachApiBearer } from "../../../../src/server/shared/session-store";
import { tokenFromCookie } from "../../../../src/server/shared/auth";
import { createSeedDirectory } from "../../../../src/test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
const previousBaseUrl = process.env.BEIM_API_BASE_URL;
const REMOTE_BASE_URL = "http://remote-stock.test";

let directory = "";
let adminCookieWithBearer = "";
let adminCookieWithoutBearer = "";
let principalCookie = "";
let sellerCookie = "";
let technicianCookie = "";

function stockRequest(cookie: string | undefined, url = "http://localhost/api/gestion/stock"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
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

describe("/api/gestion/stock remote read and explicit mutation routes", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-stock-remote-routes-");
    process.env.GESTION_DATA_DIR = directory;
    process.env.BEIM_API_BASE_URL = REMOTE_BASE_URL;

    // Corrupt local entity files so any accidental JSON read fails loudly.
    await writeFile(join(directory, "productos.json"), "not-json", "utf8");
    await writeFile(join(directory, "movimientos-stock.json"), "not-json", "utf8");
    await writeFile(join(directory, "compras.json"), "not-json", "utf8");

    adminCookieWithBearer = await loginAs("administrador");
    adminCookieWithoutBearer = await loginAs("administrador_principal");
    principalCookie = adminCookieWithoutBearer;
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

  describe("GET /api/gestion/stock", () => {
    it("rejects unauthenticated requests with 401 before checking the API bearer", async () => {
      const response = await listStock(stockRequest(undefined));

      expect(response.status).toBe(401);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("returns 503 next-implementation when the session has no API bearer", async () => {
      const response = await listStock(stockRequest(adminCookieWithoutBearer));

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
    });

    it("reads from the remote repository and does not touch the local JSON files", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
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
        if (url === `${REMOTE_BASE_URL}/api/v1/stock/movements`) {
          return Promise.resolve(remoteOk([]));
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), { status: 404 }));
      });
      vi.stubGlobal("fetch", fetchSpy);

      const response = await listStock(stockRequest(adminCookieWithBearer));

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        data: { items: { productoId: string }[]; totalItems: number };
      };
      expect(body.ok).toBe(true);
      expect(body.data.items.length).toBeGreaterThan(0);
      expect(body.data.items[0]?.productoId).toBe("p_remote");
      expect(body.data.totalItems).toBe(2); // principal + taller
      // getLevels fetches productos to build ids, then fetchLevels fetches productos + movimientos.
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const urls = fetchSpy.mock.calls.map(([url]) => url as string);
      expect(urls.filter((url) => url === `${REMOTE_BASE_URL}/api/v1/stock`)).toHaveLength(2);
      expect(urls).toContain(`${REMOTE_BASE_URL}/api/v1/stock/movements`);
      const stockCall = fetchSpy.mock.calls.find(([url]) => url === `${REMOTE_BASE_URL}/api/v1/stock`) as [
        string,
        { method: string; headers: Record<string, string> }
      ];
      expect(stockCall[1].method).toBe("GET");
      expect(stockCall[1].headers.Authorization).toBe("Bearer remote-bearer");
      vi.unstubAllGlobals();
    });

    it("preserves query parsing, deposito filtering and pagination on remote data", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
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
        if (url === `${REMOTE_BASE_URL}/api/v1/stock/movements`) {
          return Promise.resolve(remoteOk([]));
        }
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), { status: 404 }));
      });
      vi.stubGlobal("fetch", fetchSpy);

      const response = await listStock(
        stockRequest(adminCookieWithBearer, "http://localhost/api/gestion/stock?deposito=taller&page=1")
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        data: { items: unknown[]; page: number; pageSize: number; totalItems: number };
      };
      expect(body.ok).toBe(true);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(25);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.totalItems).toBe(1);
      vi.unstubAllGlobals();
    });

    it("returns 404 when the remote repository does not know the productoId", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No." } }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
      vi.stubGlobal("fetch", fetchSpy);

      const response = await listStock(
        stockRequest(adminCookieWithBearer, "http://localhost/api/gestion/stock?productoId=missing")
      );

      expect(response.status).toBe(404);
      vi.unstubAllGlobals();
    });

    it("fails closed on network failure", async () => {
      vi.stubGlobal("fetch", () => Promise.reject(new Error("connection refused")));

      const response = await listStock(stockRequest(adminCookieWithBearer));

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
          remoteOk([{ id: "p_bad" }]) // does not satisfy productoSchema
        )
      );

      const response = await listStock(stockRequest(adminCookieWithBearer));

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      vi.unstubAllGlobals();
    });
  });

  describe("POST /api/gestion/stock/movimientos", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await postMovimiento(
        mutationRequest(undefined, "http://localhost/api/gestion/stock/movimientos", "POST", { productoId: "p_1", cantidad: 1, motivo: "venta" }, "key-1")
      );

      expect(response.status).toBe(401);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 400 for an invalid payload", async () => {
      const response = await postMovimiento(
        mutationRequest(adminCookieWithBearer, "http://localhost/api/gestion/stock/movimientos", "POST", { productoId: "p_1", cantidad: 1 }, "key-1")
      );

      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 400 when the idempotency key is missing", async () => {
      const response = await postMovimiento(
        mutationRequest(adminCookieWithBearer, "http://localhost/api/gestion/stock/movimientos", "POST", { productoId: "p_1", cantidad: 1, motivo: "venta" }, undefined)
      );

      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    });

    it("rejects ajuste from non-principal admin (403) and leaves local JSON untouched", async () => {
      const before = await readFile(join(directory, "movimientos-stock.json"), "utf8");
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await postMovimiento(
        mutationRequest(
          adminCookieWithBearer,
          "http://localhost/api/gestion/stock/movimientos",
          "POST",
          { productoId: "p_1", cantidad: 1, motivo: "venta", ajuste: true },
          "key-ajuste-403"
        )
      );

      expect(response.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await readFile(join(directory, "movimientos-stock.json"), "utf8")).toBe(before);
      vi.unstubAllGlobals();
    });

    it("returns 503 next-implementation for an authorized outflow and does not call fetch", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await postMovimiento(
        mutationRequest(
          sellerCookie,
          "http://localhost/api/gestion/stock/movimientos",
          "POST",
          { productoId: "p_1", cantidad: 1, motivo: "venta" },
          "key-1"
        )
      );

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe("POST /api/gestion/stock/transferencias", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await postTransferencia(
        mutationRequest(undefined, "http://localhost/api/gestion/stock/transferencias", "POST", { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" }, "key-1")
      );

      expect(response.status).toBe(401);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 403 for roles that cannot write stock", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await postTransferencia(
        mutationRequest(
          technicianCookie,
          "http://localhost/api/gestion/stock/transferencias",
          "POST",
          { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" },
          "key-1"
        )
      );

      expect(response.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("returns 400 for an invalid payload", async () => {
      const response = await postTransferencia(
        mutationRequest(
          adminCookieWithBearer,
          "http://localhost/api/gestion/stock/transferencias",
          "POST",
          { productoId: "p_1", cantidad: 1, origen: "principal", destino: "principal" },
          "key-1"
        )
      );

      expect(response.status).toBe(400);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 503 next-implementation for an authorized transfer and does not call fetch", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await postTransferencia(
        mutationRequest(
          adminCookieWithBearer,
          "http://localhost/api/gestion/stock/transferencias",
          "POST",
          { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" },
          "key-1"
        )
      );

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
