import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { PATCH as anularCompraRoute } from "../../../app/api/gestion/compras/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { ERROR_CODES } from "../handlers/errors";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import type { AuthActor } from "../handlers/auth";
import { createStockUseCases } from "../composition/stock";
import { toStockActor } from "./stock";
import { createSeedDirectory } from "../../test/seed-dir";

function actor(username: string, role: AuthActor["role"], id: string): AuthActor {
  return { id, username, displayName: username, role };
}

const admin = actor("administrador", "administrador", "u-administrador");
const seller = actor("vendedor", "vendedor", "u-vendedor");

let directory = "";

async function fileText(name: string): Promise<string> {
  return readFile(join(directory, name), "utf8");
}

async function snapshot(): Promise<Record<string, string>> {
  return {
    compras: await fileText("compras.json"),
    productos: await fileText("productos.json"),
    movimientos: await fileText("movimientos-stock.json"),
    audit: await fileText("audit.json"),
  };
}

async function seedPurchase(productoId = "p_1", cantidad = 2, key = "key-anular-seed"): Promise<string> {
  const useCases = createStockUseCases(directory);
  const recorded = await useCases.recordPurchase(toStockActor(admin), {
    productoId,
    cantidad,
    costoUnitario: 50,
    proveedor: "Proveedor Andina",
    comprobante: "FAC-001",
  }, key);
  expect(recorded.ok).toBe(true);
  if (!recorded.ok) throw new Error("Expected seed purchase to persist.");
  return recorded.value.compra.id;
}

function patchRequest(cookie: string | undefined, id: string, body: unknown, key?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest(`http://localhost/api/gestion/compras/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function paramsFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function loginAs(username: string): Promise<string> {
  const result = await new AuthService(directory).login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

beforeEach(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-compras-anular-");
  process.env.GESTION_DATA_DIR = directory;
});

afterEach(async () => {
  delete process.env.GESTION_DATA_DIR;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});

describe("compras anular use case (CMP-c1)", () => {
  it("requires motivo and idempotency key with zero writes", async () => {
    const id = await seedPurchase();
    const before = await snapshot();
    const useCases = createStockUseCases(directory);
    expect(await useCases.anularCompra(toStockActor(admin), id, {}, "key-motivo-missing")).toMatchObject({
      ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR },
    });
    expect(await useCases.anularCompra(toStockActor(admin), id, { motivo: "" }, "key-motivo-blank")).toMatchObject({
      ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR },
    });
    expect(await useCases.anularCompra(toStockActor(admin), id, { motivo: "ok" }, undefined)).toMatchObject({
      ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR },
    });
    expect(await snapshot()).toEqual(before);
  });

  it("forbids non-admin callers with zero writes", async () => {
    const id = await seedPurchase();
    const before = await snapshot();
    const useCases = createStockUseCases(directory);
    const denied = await useCases.anularCompra(toStockActor(seller), id, { motivo: "error" }, "key-seller-anular");
    expect(denied).toMatchObject({ ok: false, error: { code: ERROR_CODES.FORBIDDEN } });
    expect(await snapshot()).toEqual(before);
  });

  it("annuls once: decrements stock, writes one anulacion reversal, audits compra.anular", async () => {
    const id = await seedPurchase("p_1", 2, "key-anular-once");
    const useCases = createStockUseCases(directory);
    const beforeProducts = JSON.parse(await fileText("productos.json")) as {
      productos: { id: string; stock: number }[];
    };
    const beforeStock = beforeProducts.productos.find((p) => p.id === "p_1")?.stock ?? -1;
    const anulled = await useCases.anularCompra(toStockActor(admin), id, { motivo: "devolucion" }, "key-anular-once-1");
    expect(anulled.ok).toBe(true);
    if (!anulled.ok) return;
    expect(anulled.value.id).toBe(id);
    const afterProducts = JSON.parse(await fileText("productos.json")) as {
      productos: { id: string; stock: number }[];
    };
    expect(afterProducts.productos.find((p) => p.id === "p_1")?.stock).toBe(beforeStock - 2);
    const moves = JSON.parse(await fileText("movimientos-stock.json")) as {
      movimientosStock: { motivo: string; referencia?: string; cantidad: number }[];
    };
    const reversals = moves.movimientosStock.filter((m) => m.motivo === "anulacion" && m.referencia === id);
    expect(reversals).toHaveLength(1);
    expect(reversals[0]?.cantidad).toBe(-2);
    const audit = await fileText("audit.json");
    expect(audit).toMatch(/compra\.anular/);
  });

  it("is idempotent: same-key replay and new-key re-annul are no-ops with a single reversal", async () => {
    const id = await seedPurchase("p_1", 2, "key-anular-idem-seed");
    const useCases = createStockUseCases(directory);
    const first = await useCases.anularCompra(toStockActor(admin), id, { motivo: "devolucion" }, "key-anular-idem");
    expect(first.ok).toBe(true);
    const second = await useCases.anularCompra(toStockActor(admin), id, { motivo: "devolucion" }, "key-anular-idem");
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value).toEqual(first.value);
    const third = await useCases.anularCompra(toStockActor(admin), id, { motivo: "devolucion" }, "key-anular-idem-new");
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.value).toEqual(first.value);
    const moves = JSON.parse(await fileText("movimientos-stock.json")) as {
      movimientosStock: { motivo: string; referencia?: string }[];
    };
    expect(moves.movimientosStock.filter((m) => m.motivo === "anulacion" && m.referencia === id)).toHaveLength(1);
  });

  it("returns CONFLICT with zero writes when stock cannot cover the reversal", async () => {
    const id = await seedPurchase("p_1", 3, "key-anular-short-seed");
    const useCases = createStockUseCases(directory);
    const drained = await useCases.recordOutflow(toStockActor(admin), {
      productoId: "p_1", cantidad: 10, motivo: "consumo",
    }, "key-drain-stock");
    expect(drained.ok).toBe(true);
    const before = await snapshot();
    const conflict = await useCases.anularCompra(toStockActor(admin), id, { motivo: "sin saldo" }, "key-anular-short");
    expect(conflict).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
    expect(await snapshot()).toEqual(before);
  });

  it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids", async () => {
    const useCases = createStockUseCases(directory);
    const missing = await useCases.anularCompra(toStockActor(admin), "co_missing", { motivo: "x" }, "key-missing");
    expect(missing).toMatchObject({ ok: false, error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN } });
  });
});

describe("PATCH /api/gestion/compras/[id] (CMP-c1)", () => {
  it("responds 401 without session", async () => {
    const id = await seedPurchase("p_1", 1, "key-route-401-seed");
    const response = await anularCompraRoute(patchRequest(undefined, id, { motivo: "x" }, "k-401"), paramsFor(id));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("responds 403 for vendedor, 400 for missing key/motivo, 404 for unknown ids", async () => {
    const id = await seedPurchase("p_1", 1, "key-route-guards-seed");
    const adminCookie = await loginAs("administrador");
    const sellerCookie = await loginAs("vendedor");
    const forbidden = await anularCompraRoute(patchRequest(sellerCookie, id, { motivo: "x" }, "k-seller"), paramsFor(id));
    expect(forbidden.status).toBe(403);
    const noKey = await anularCompraRoute(patchRequest(adminCookie, id, { motivo: "x" }), paramsFor(id));
    expect(noKey.status).toBe(400);
    const badMotivo = await anularCompraRoute(patchRequest(adminCookie, id, { motivo: "" }, "k-bad"), paramsFor(id));
    expect(badMotivo.status).toBe(400);
    const missing = await anularCompraRoute(patchRequest(adminCookie, "co_missing", { motivo: "x" }, "k-missing"), paramsFor("co_missing"));
    expect(missing.status).toBe(404);
  });

  it("annuls and replays idempotently with a single reversal", async () => {
    const id = await seedPurchase("p_1", 1, "key-route-ok-seed");
    const adminCookie = await loginAs("administrador");
    const first = await anularCompraRoute(patchRequest(adminCookie, id, { motivo: "devolucion" }, "k-route-1"), paramsFor(id));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { ok: boolean; data: { id: string } };
    expect(firstBody).toMatchObject({ ok: true, data: { id } });
    const second = await anularCompraRoute(patchRequest(adminCookie, id, { motivo: "devolucion" }, "k-route-1"), paramsFor(id));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, data: firstBody.data });
    const moves = JSON.parse(await fileText("movimientos-stock.json")) as {
      movimientosStock: { motivo: string; referencia?: string }[];
    };
    expect(moves.movimientosStock.filter((m) => m.motivo === "anulacion" && m.referencia === id)).toHaveLength(1);
  });
});
