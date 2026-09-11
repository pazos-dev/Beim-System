import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as listStock } from "../../../app/api/gestion/stock/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { attachApiBearer } from "../shared/session-store";
import { tokenFromCookie } from "../shared/auth";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
const previousBaseUrl = process.env.BEIM_API_BASE_URL;
const REMOTE_BASE_URL = "http://remote-stock-routes.test";

let directory = "";
let adminCookieWithBearer = "";
let adminCookieWithoutBearer = "";
let sellerCookie = "";

function stockRequest(cookie: string | undefined, url = "http://localhost/api/gestion/stock"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
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

describe("GET /api/gestion/stock (remote read route)", () => {
  it("rejects listing without a session (401)", async () => {
    const response = await listStock(stockRequest(undefined));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
  });

  it("ignores a forged client-side role and requires a session", async () => {
    const forged = await listStock(
      stockRequest(sellerCookie, "http://localhost/api/gestion/stock?role=administrador")
    );
    expect(forged.status).toBe(503);
    const unauthenticated = await listStock(
      stockRequest(undefined, "http://localhost/api/gestion/stock?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists levels from the remote repository with the envelope contract", async () => {
    const fetchSpy = vi.fn().mockImplementation((url: string) => {
      if (url === `${REMOTE_BASE_URL}/api/v1/stock`) {
        return Promise.resolve(
          remoteOk([
            {
              id: "p_1",
              ownerId: "u-remote",
              version: 1,
              displayName: "Batería remota",
              price: 1200,
              cost: 800,
              stock: 8,
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
    // getLevels fetches productos to build ids, then fetchLevels fetches productos + movimientos.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  it("returns 404 for unknown producto ids from the remote repository", async () => {
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

  it("returns 503 when the session has no API bearer", async () => {
    const response = await listStock(stockRequest(adminCookieWithoutBearer));

    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(body.error.message).toMatch(/^Próxima implementación:/);
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-stock-routes-");
  process.env.GESTION_DATA_DIR = directory;
  process.env.BEIM_API_BASE_URL = REMOTE_BASE_URL;

  await writeFile(join(directory, "productos.json"), "not-json", "utf8");
  await writeFile(join(directory, "movimientos-stock.json"), "not-json", "utf8");

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
