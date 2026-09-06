import { rm } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listVentas, POST as createVenta } from "../../../app/api/gestion/ventas/route";
import { GET as getVenta } from "../../../app/api/gestion/ventas/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let sellerCookie = "";
let adminCookie = "";

function ventasRequest(cookie: string | undefined, url = "http://localhost/api/gestion/ventas"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
}

function ventaByIdRequest(cookie: string | undefined, id: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost/api/gestion/ventas/${id}`, { headers });
}

function createRequest(cookie: string | undefined, body: unknown, key?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest("http://localhost/api/gestion/ventas", {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("GET /api/gestion/ventas (VTA-1)", () => {
  it("rejects listing and detail without a session (401)", async () => {
    const listed = await listVentas(ventasRequest(undefined));
    expect(listed.status).toBe(401);
    expect(await listed.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    const found = await getVenta(ventaByIdRequest(undefined, "v_1"), {
      params: Promise.resolve({ id: "v_1" })
    });
    expect(found.status).toBe(401);
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await listVentas(
      ventasRequest(sellerCookie, "http://localhost/api/gestion/ventas?role=administrador")
    );
    expect(forged.status).toBe(200);
    const unauthenticated = await listVentas(
      ventasRequest(undefined, "http://localhost/api/gestion/ventas?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists the envelope with own-only visibility", async () => {
    const admin = await listVentas(ventasRequest(adminCookie));
    expect(admin.status).toBe(200);
    const adminBody = (await admin.json()) as {
      ok: boolean;
      data: { items: unknown[]; page: number; pageSize: number; totalItems: number };
    };
    expect(adminBody.ok).toBe(true);
    expect(adminBody.data.page).toBe(1);
    expect(adminBody.data.pageSize).toBe(25);
    expect(adminBody.data.totalItems).toBe(2);
    expect(JSON.stringify(adminBody)).not.toMatch(/ownerId/);

    const seller = await listVentas(ventasRequest(sellerCookie));
    expect(seller.status).toBe(200);
    const sellerBody = (await seller.json()) as {
      ok: boolean;
      data: { items: { id: string }[]; totalItems: number };
    };
    expect(sellerBody.data.totalItems).toBe(1);
    expect(sellerBody.data.items.map((item) => item.id)).toEqual(["v_1"]);
  });

  it("filters by estado and q", async () => {
    const filtered = await listVentas(
      ventasRequest(adminCookie, "http://localhost/api/gestion/ventas?estado=confirmada&q=0001-000102")
    );
    expect(filtered.status).toBe(200);
    const body = (await filtered.json()) as {
      ok: boolean;
      data: { items: { id: string }[]; totalItems: number };
    };
    expect(body.data.totalItems).toBe(1);
    expect(body.data.items.map((item) => item.id)).toEqual(["v_2"]);

    const empty = await listVentas(
      ventasRequest(adminCookie, "http://localhost/api/gestion/ventas?estado=anulada")
    );
    expect(empty.status).toBe(200);
    const emptyBody = (await empty.json()) as {
      ok: boolean;
      data: { items: unknown[]; totalItems: number };
    };
    expect(emptyBody.data.totalItems).toBe(0);
    expect(emptyBody.data.items).toEqual([]);
  });

  it("hides foreign sales and misses with 404", async () => {
    const foreign = await getVenta(ventaByIdRequest(sellerCookie, "v_2"), {
      params: Promise.resolve({ id: "v_2" })
    });
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN" }
    });
    const missing = await getVenta(ventaByIdRequest(adminCookie, "missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    expect(missing.status).toBe(404);
    const own = await getVenta(ventaByIdRequest(sellerCookie, "v_1"), {
      params: Promise.resolve({ id: "v_1" })
    });
    expect(own.status).toBe(200);
  });
});

describe("POST /api/gestion/ventas (VTA-2)", () => {
  const saleBody = {
    items: [{ productoId: "p_1", cantidad: 1, precio: 1 }],
    pagos: [{ metodo: "efectivo", monto: 1200 }]
  };

  it("creates with catalog pricing ignoring client precio and replays once", async () => {
    const first = await createVenta(createRequest(sellerCookie, saleBody, "route-create-1"));
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { ok: boolean; data: { id: string; total: number } };
    expect(firstBody.data.total).toBe(1200);
    const second = await createVenta(createRequest(sellerCookie, saleBody, "route-create-1"));
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual({ ok: true, data: firstBody.data });
  });

  it("requires an idempotency key with 400", async () => {
    const response = await createVenta(createRequest(sellerCookie, saleBody));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 409 on insufficient stock", async () => {
    const response = await createVenta(
      createRequest(sellerCookie, {
        items: [{ productoId: "p_2", cantidad: 5 }],
        pagos: [{ metodo: "efectivo", monto: 3000 }]
      }, "route-create-409")
    );
    expect(response.status).toBe(409);
  });
});
beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-ventas-routes-");
  process.env.GESTION_DATA_DIR = directory;
  sellerCookie = await loginAs("vendedor");
  adminCookie = await loginAs("administrador");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
