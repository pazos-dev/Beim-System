import { rm } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listOrdenes, POST as createOrden } from "../../../app/api/gestion/ordenes/route";
import {
  GET as getOrden,
  PATCH as patchOrden
} from "../../../app/api/gestion/ordenes/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { createSeedDirectory } from "../../test/seed-dir";
import { SESSION_COOKIE_NAME } from "../handlers/session";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let sellerCookie = "";
let techCookie = "";
let adminCookie = "";

interface RouteTestInit {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
}

function ordenesRequest(cookie: string | undefined, init?: RouteTestInit): NextRequest {
  const headers: Record<string, string> = { ...(init?.headers ?? {}) };
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest("http://localhost/api/gestion/ordenes", { ...init, headers });
}

function ordenByIdRequest(cookie: string | undefined, id: string, init?: RouteTestInit): NextRequest {
  const headers: Record<string, string> = { ...(init?.headers ?? {}) };
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost/api/gestion/ordenes/${id}`, { ...init, headers });
}

function paramsFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("/api/gestion/ordenes routes", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-orders-routes-");
    process.env.GESTION_DATA_DIR = directory;
    sellerCookie = await loginAs("vendedor");
    techCookie = await loginAs("tecnico");
    adminCookie = await loginAs("administrador");
  });

  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
  });

  it("rejects listing and creation without a session", async () => {
    const listed = await listOrdenes(ordenesRequest(undefined));
    expect(listed.status).toBe(401);
    expect(await bodyOf(listed)).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });

    const created = await createOrden(
      ordenesRequest(undefined, {
        method: "POST",
        body: JSON.stringify({ clienteId: "c_1", total: 100 })
      })
    );
    const createdBody = await bodyOf(created);
    expect(created.status).toBe(401);
    expect(createdBody).not.toHaveProperty("data");
  });

  it("lists only the session actor's own orders with the enriched view contract", async () => {
    const mine = await listOrdenes(ordenesRequest(sellerCookie));
    expect(mine.status).toBe(200);
    expect(await bodyOf(mine)).toMatchObject({ ok: true, data: { items: [], counts: {} } });

    const all = await listOrdenes(ordenesRequest(adminCookie));
    const allBody = await bodyOf(all);
    expect(all.status).toBe(200);
    const data = allBody["data"] as { items: unknown[]; counts: Record<string, number> };
    expect(data["items"].length).toBeGreaterThanOrEqual(2);
    expect(data["counts"]["todas"]).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(allBody)).not.toMatch(/credential|desbloqueo|password/i);
  });

  it("rejects an unknown order filter with 400", async () => {
    const request = ordenesRequest(adminCookie);
    request.nextUrl.searchParams.set("estado", "inexistente");
    const response = await listOrdenes(request);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" }
    });
  });

  it("creates an order and hides it from other owners", async () => {
    const created = await createOrden(
      ordenesRequest(sellerCookie, {
        method: "POST",
        body: JSON.stringify({ clienteId: "c_1", total: 500 })
      })
    );
    expect(created.status).toBe(201);
    const createdBody = await bodyOf(created);
    const order = createdBody["data"] as { id: string };
    expect(createdBody).toMatchObject({ ok: true });

    const foreign = await getOrden(ordenByIdRequest(techCookie, order.id), paramsFor(order.id));
    expect(foreign.status).toBe(404);
    expect(await bodyOf(foreign)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN" }
    });

    const own = await getOrden(ordenByIdRequest(sellerCookie, order.id), paramsFor(order.id));
    expect(own.status).toBe(200);
  });

  it("returns 404 for foreign orders and 409 for invalid transitions", async () => {
    const foreign = await getOrden(ordenByIdRequest(sellerCookie, "o_1"), paramsFor("o_1"));
    expect(foreign.status).toBe(404);
    expect(await bodyOf(foreign)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN" }
    });

    const patched = await patchOrden(
      ordenByIdRequest(adminCookie, "o_1", {
        method: "PATCH",
        body: JSON.stringify({ estado: "entregado", expectedVersion: 1 })
      }),
      paramsFor("o_1")
    );
    expect(patched.status).toBe(409);
  });
});
