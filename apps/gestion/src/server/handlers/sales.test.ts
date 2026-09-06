import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listVentas, POST as createVenta } from "../../../app/api/gestion/ventas/route";
import { PATCH as anularVenta } from "../../../app/api/gestion/ventas/[id]/route";
import { AuthService, clearSessionsForTests } from "./auth";
import { createSeedDirectory } from "../../test/seed-dir";
import { SESSION_COOKIE_NAME } from "./session";
import { ERROR_CODES } from "./errors";
import { createOrderStores, type OrderActor } from "./order-context";
import { SalesHandler } from "./sales";

const vendedor: OrderActor = { id: "u-vendedor", role: "vendedor", hasGlobalAccess: false };
const tecnico: OrderActor = { id: "u-tecnico", role: "tecnico", hasGlobalAccess: false };
const caja: OrderActor = { id: "u-caja", role: "caja", hasGlobalAccess: false };
const admin: OrderActor = { id: "u-administrador", role: "administrador", hasGlobalAccess: true };

let directory = "";
let handler: SalesHandler;

function saleInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return { items: [{ productoId: "p_1", cantidad: 1, precio: 1200 }], pagos: [{ metodo: "efectivo", monto: 1200 }], ...overrides };
}

async function fileJson(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(directory, name), "utf8")) as Record<string, unknown>;
}

function itemsOf(doc: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  return doc[key] as Array<Record<string, unknown>>;
}

function ventasRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/gestion/ventas", { method: body === undefined ? "GET" : "POST", headers: {}, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeEach(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-sales-");
  process.env.GESTION_DATA_DIR = directory;
  handler = new SalesHandler(createOrderStores(directory));
});

afterEach(async () => {
  delete process.env.GESTION_DATA_DIR;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});

describe("SalesHandler.create", () => {
  it("crea con pago exacto y descuenta stock con salida por linea", async () => {
    const created = await handler.create(vendedor, saleInput({ pagos: [{ metodo: "efectivo", monto: 800 }, { metodo: "tarjeta", monto: 400 }] }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({ total: 1200, estado: "confirmada", ownerId: "u-vendedor" });
    expect(itemsOf(await fileJson("productos.json"), "productos").find((item) => item.id === "p_1")?.stock).toBe(7);
    expect(itemsOf(await fileJson("movimientos-stock.json"), "movimientosStock").filter((move) => move.motivo === "venta" && move.referencia === created.value.id)).toHaveLength(1);
  });

  it("rechaza pago de mas o de menos sin mutar nada", async () => {
    const before = await fileJson("productos.json");
    for (const monto of [1300, 1100]) {
      expect(await handler.create(vendedor, saleInput({ pagos: [{ metodo: "efectivo", monto }] }))).toMatchObject({ ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR } });
    }
    expect(await fileJson("productos.json")).toEqual(before);
    expect(itemsOf(await fileJson("ventas.json"), "ventas")).toHaveLength(2);
  });

  it("rechaza un segundo descuento y bloquea stock insuficiente", async () => {
    const before = await fileJson("ventas.json");
    expect(await handler.create(vendedor, saleInput({ descuentos: [{ motivo: "promo", monto: 100 }, { motivo: "extra", monto: 50 }] }))).toMatchObject({ ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR } });
    expect(await handler.create(vendedor, saleInput({ items: [{ productoId: "p_2", cantidad: 5, precio: 600 }], pagos: [{ metodo: "efectivo", monto: 3000 }] }))).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
    expect(await fileJson("ventas.json")).toEqual(before);
  });

  it("vincula ordenId y marca su paymentStatus como pagado", async () => {
    const created = await handler.create(admin, saleInput({ ordenId: "o_1" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.ordenId).toBe("o_1");
    expect(itemsOf(await fileJson("ordenes.json"), "ordenes").find((orden) => orden.id === "o_1")?.paymentStatus).toBe("pagado");
  });

  it("oculta ventas de otro owner", async () => {
    const created = await handler.create(vendedor, saleInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await handler.getById(tecnico, created.value.id)).toMatchObject({ ok: false, error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN } });
    const listed = await handler.list(tecnico);
    expect(listed.ok && listed.value).toHaveLength(0);
  });
});

describe("SalesHandler.anular", () => {
  it("es idempotente: doble anulacion devuelve la misma venta con un solo juego reverso", async () => {
    const created = await handler.create(vendedor, saleInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await handler.anular(admin, created.value.id, { motivo: "devolucion" }, "anular-key-1");
    const second = await handler.anular(admin, created.value.id, { motivo: "devolucion" }, "anular-key-1");
    const third = await handler.anular(admin, created.value.id, { motivo: "devolucion" });
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;
    expect(second.value).toEqual(first.value);
    expect(third.value).toMatchObject({ id: first.value.id, estado: "anulada" });
    expect(itemsOf(await fileJson("movimientos-stock.json"), "movimientosStock").filter((move) => move.motivo === "anulacion" && move.referencia === created.value.id)).toHaveLength(1);
    expect(itemsOf(await fileJson("productos.json"), "productos").find((item) => item.id === "p_1")?.stock).toBe(8);
  });
});

describe("/api/gestion/ventas routes", () => {
  it("exige sesion con 401 y envelope sin secretos", async () => {
    const listed = await listVentas(ventasRequest());
    expect(listed.status).toBe(401);
    expect(JSON.stringify(await listed.json())).not.toMatch(/credential|password/i);
    expect((await createVenta(ventasRequest(saleInput()))).status).toBe(401);
  });
});

describe("PATCH /api/gestion/ventas/[id]", () => {
  function anularRequest(cookie: string | undefined, id: string, body: unknown, key?: string): NextRequest {
    const headers: Record<string, string> = {};
    if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
    if (key !== undefined) headers["x-idempotency-key"] = key;
    return new NextRequest(`http://localhost/api/gestion/ventas/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  }

  function paramsFor(id: string): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
  }

  async function loginAs(username: string): Promise<string> {
    const result = await new AuthService(directory).login({ username, credential: `dev-${username}` });
    if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
    return result.value.cookieValue;
  }

  it("responde 401 sin sesion con envelope", async () => {
    const response = await anularVenta(anularRequest(undefined, "v_1", { motivo: "error" }), paramsFor("v_1"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("anula y repite idempotente con la misma clave sin duplicar reversos", async () => {
    const created = await handler.create(vendedor, saleInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const cookie = await loginAs("administrador");
    const first = await anularVenta(anularRequest(cookie, created.value.id, { motivo: "devolucion" }, "venta-anular-1"), paramsFor(created.value.id));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { data: { id: string; estado: string } };
    expect(firstBody.data).toMatchObject({ id: created.value.id, estado: "anulada" });
    const second = await anularVenta(anularRequest(cookie, created.value.id, { motivo: "devolucion" }, "venta-anular-1"), paramsFor(created.value.id));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, data: firstBody.data });
    expect(itemsOf(await fileJson("movimientos-stock.json"), "movimientosStock").filter((move) => move.motivo === "anulacion" && move.referencia === created.value.id)).toHaveLength(1);
  });

  it("responde 404 ante venta ajena o inexistente", async () => {
    const cookie = await loginAs("administrador");
    const response = await anularVenta(anularRequest(cookie, "v_inexistente", { motivo: "error" }, "venta-404-key"), paramsFor("v_inexistente"));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN" } });
  });

  it("responde 403 sin mutar nada ante vendedor o caja", async () => {
    const created = await handler.create(vendedor, saleInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const before = {
      productos: await fileJson("productos.json"),
      ventas: await fileJson("ventas.json"),
      movimientos: await fileJson("movimientos-stock.json")
    };
    expect(await handler.anular(vendedor, created.value.id, { motivo: "devolucion" }, "anular-403-v")).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.FORBIDDEN }
    });
    expect(await handler.anular(caja, created.value.id, { motivo: "devolucion" }, "anular-403-c")).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.FORBIDDEN }
    });
    expect(await fileJson("productos.json")).toEqual(before.productos);
    expect(await fileJson("ventas.json")).toEqual(before.ventas);
    expect(await fileJson("movimientos-stock.json")).toEqual(before.movimientos);
    const sellerCookie = await loginAs("vendedor");
    const forbidden = await anularVenta(
      anularRequest(sellerCookie, created.value.id, { motivo: "devolucion" }, "anular-403-route"),
      paramsFor(created.value.id)
    );
    expect(forbidden.status).toBe(403);
  });
});
