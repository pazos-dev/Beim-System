import { rm } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listStock } from "../../../app/api/gestion/stock/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let adminCookie = "";
let sellerCookie = "";

function stockRequest(cookie: string | undefined, url = "http://localhost/api/gestion/stock"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("GET /api/gestion/stock (STK-1)", () => {
  it("rejects listing without a session (401)", async () => {
    const response = await listStock(stockRequest(undefined));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await listStock(
      stockRequest(sellerCookie, "http://localhost/api/gestion/stock?role=administrador")
    );
    expect(forged.status).toBe(200);
    const unauthenticated = await listStock(
      stockRequest(undefined, "http://localhost/api/gestion/stock?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists levels with the envelope contract", async () => {
    const response = await listStock(
      stockRequest(adminCookie, "http://localhost/api/gestion/stock?deposito=taller&page=1")
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: unknown[]; page: number; pageSize: number; totalItems: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(25);
  });

  it("returns 404 for unknown producto ids", async () => {
    const response = await listStock(
      stockRequest(adminCookie, "http://localhost/api/gestion/stock?productoId=missing")
    );
    expect(response.status).toBe(404);
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-stock-routes-");
  process.env.GESTION_DATA_DIR = directory;
  adminCookie = await loginAs("administrador");
  sellerCookie = await loginAs("vendedor");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
