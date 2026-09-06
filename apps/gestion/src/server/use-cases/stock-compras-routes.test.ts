import { rm } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listCompras } from "../../../app/api/gestion/compras/route";
import { GET as getCompra } from "../../../app/api/gestion/compras/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createStockUseCases } from "../composition/stock";
import { toStockActor } from "./stock";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let adminCookie = "";
let sellerCookie = "";
let firstCompraId = "";

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

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("GET /api/gestion/compras (CMP-a2)", () => {
  it("rejects listing and detail without a session (401)", async () => {
    const listed = await listCompras(comprasRequest(undefined));
    expect(listed.status).toBe(401);
    expect(await listed.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    const found = await getCompra(compraByIdRequest(undefined, firstCompraId), {
      params: Promise.resolve({ id: firstCompraId })
    });
    expect(found.status).toBe(401);
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await listCompras(
      comprasRequest(sellerCookie, "http://localhost/api/gestion/compras?role=administrador")
    );
    expect(forged.status).toBe(403);
    const unauthenticated = await listCompras(
      comprasRequest(undefined, "http://localhost/api/gestion/compras?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists seeded history with the envelope contract and filters by proveedor", async () => {
    const response = await listCompras(comprasRequest(adminCookie));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: { id: string }[]; page: number; pageSize: number; totalItems: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({ page: 1, pageSize: 25, totalItems: 2 });
    expect(JSON.stringify(body)).not.toMatch(/ownerId/);
    const filtered = await listCompras(
      comprasRequest(adminCookie, "http://localhost/api/gestion/compras?proveedor=Proveedor%20Andina")
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as { data: { totalItems: number } };
    expect(filteredBody.data.totalItems).toBe(1);
  });

  it("returns 403 with nothing leaked for non-admin readers and 404 for unknown ids", async () => {
    const forbidden = await listCompras(comprasRequest(sellerCookie));
    expect(forbidden.status).toBe(403);
    const forbiddenBody = (await forbidden.json()) as { ok: boolean; error: { code: string } };
    expect(forbiddenBody).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(JSON.stringify(forbiddenBody)).not.toMatch(/Proveedor/);
    const forbiddenDetail = await getCompra(compraByIdRequest(sellerCookie, firstCompraId), {
      params: Promise.resolve({ id: firstCompraId })
    });
    expect(forbiddenDetail.status).toBe(403);
    const missing = await getCompra(compraByIdRequest(adminCookie, "missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    expect(missing.status).toBe(404);
    const found = await getCompra(compraByIdRequest(adminCookie, firstCompraId), {
      params: Promise.resolve({ id: firstCompraId })
    });
    expect(found.status).toBe(200);
  });

  it("returns 400 for invalid list queries", async () => {
    const response = await listCompras(comprasRequest(adminCookie, "http://localhost/api/gestion/compras?page=0"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" }
    });
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-compras-routes-");
  process.env.GESTION_DATA_DIR = directory;
  adminCookie = await loginAs("administrador");
  sellerCookie = await loginAs("vendedor");
  const useCases = createStockUseCases(directory);
  const adminActor = { id: "u-administrador", username: "administrador", displayName: "Admin", role: "administrador" } as const;
  const first = await useCases.recordPurchase(toStockActor(adminActor), {
    productoId: "p_1",
    cantidad: 2,
    costoUnitario: 50,
    proveedor: "Proveedor Andina",
    comprobante: "FAC-001"
  }, "key-route-andina");
  if (!first.ok) throw new Error("Expected the Andina seed purchase to persist.");
  firstCompraId = first.value.compra.id;
  const second = await useCases.recordPurchase(toStockActor(adminActor), {
    productoId: "p_2",
    cantidad: 1,
    costoUnitario: 70,
    proveedor: "Proveedor Boreal",
    comprobante: "FAC-002"
  }, "key-route-boreal");
  if (!second.ok) throw new Error("Expected the Boreal seed purchase to persist.");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
