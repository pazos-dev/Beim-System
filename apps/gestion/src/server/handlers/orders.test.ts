import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ERROR_CODES } from "../handlers/errors";
import { createOrderStores, OrderHandler, type OrderActor } from "./orders";

const vendedor: OrderActor = { id: "u-vendedor", role: "vendedor", hasGlobalAccess: false };
const tecnico: OrderActor = { id: "u-tecnico", role: "tecnico", hasGlobalAccess: false };
const caja: OrderActor = { id: "u-caja", role: "caja", hasGlobalAccess: false };
const admin: OrderActor = { id: "u-administrador", role: "administrador", hasGlobalAccess: true };

let directory = "";
let handler: OrderHandler;

async function fileJson(name: string): Promise<{ version: number; [key: string]: unknown }> {
  const raw = await readFile(join(directory, name), "utf8");
  return JSON.parse(raw) as { version: number; [key: string]: unknown };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "gestion-orders-"));
  await cp(join(process.cwd(), "data"), directory, { recursive: true });
  handler = new OrderHandler(createOrderStores(directory));
});

afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe("OrderHandler.create", () => {
  it("assigns owner to the creating actor with an initial version", async () => {
    const created = await handler.create(vendedor, { clienteId: "c_1", total: 900 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({
      ownerId: "u-vendedor",
      version: 1,
      clienteId: "c_1",
      estado: "en_diagnostico",
      paymentStatus: "pendiente"
    });
  });

  it("rejects a duplicated business numero without persisting", async () => {
    const before = await fileJson("ordenes.json");
    const duplicated = await handler.create(vendedor, {
      clienteId: "c_1",
      numero: "0001-000001",
      total: 100
    });
    const after = await fileJson("ordenes.json");
    expect(duplicated).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
    expect(after).toEqual(before);
  });

  it("returns the existing order when the idempotency key is retried", async () => {
    const first = await handler.create(
      vendedor,
      { clienteId: "c_1", total: 900 },
      "orden-key-1"
    );
    const second = await handler.create(
      vendedor,
      { clienteId: "c_1", total: 900 },
      "orden-key-1"
    );
    const doc = await fileJson("ordenes.json");
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);
    expect(doc["ordenes"]).toHaveLength(3);
  });

  it("rejects a reused idempotency key with a different payload", async () => {
    const first = await handler.create(vendedor, { clienteId: "c_1", total: 900 }, "orden-key-2");
    expect(first.ok).toBe(true);
    const conflict = await handler.create(vendedor, { clienteId: "c_1", total: 100 }, "orden-key-2");
    expect(conflict).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
  });

  it("applies stock and payment atomically when a sale is attached", async () => {
    const created = await handler.create(vendedor, {
      clienteId: "c_1",
      sale: {
        items: [{ productoId: "p_1", cantidad: 2, precio: 1200 }],
        pagos: [{ metodo: "efectivo", monto: 2400 }]
      }
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value).toMatchObject({ total: 2400, paymentStatus: "pagado" });

    const productos = await fileJson("productos.json");
    const items = productos["productos"] as Array<{ id: string; stock: number }>;
    expect(items.find((item) => item.id === "p_1")?.stock).toBe(6);

    const movimientos = await fileJson("movimientos-stock.json");
    const moves = movimientos["movimientosStock"] as Array<Record<string, unknown>>;
    expect(moves.some((move) => move["cantidad"] === -2 && move["motivo"] === "venta")).toBe(true);

    const ventas = await fileJson("ventas.json");
    expect(ventas["ventas"]).toHaveLength(3);
  });

  it("reverts everything when stock is insufficient", async () => {
    const beforeOrdenes = await fileJson("ordenes.json");
    const beforeVentas = await fileJson("ventas.json");
    const beforeProductos = await fileJson("productos.json");
    const beforeMovimientos = await fileJson("movimientos-stock.json");

    const failed = await handler.create(vendedor, {
      clienteId: "c_1",
      sale: {
        items: [{ productoId: "p_2", cantidad: 5, precio: 600 }],
        pagos: [{ metodo: "efectivo", monto: 3000 }]
      }
    });

    expect(failed).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
    expect(await fileJson("ordenes.json")).toEqual(beforeOrdenes);
    expect(await fileJson("ventas.json")).toEqual(beforeVentas);
    expect(await fileJson("productos.json")).toEqual(beforeProductos);
    expect(await fileJson("movimientos-stock.json")).toEqual(beforeMovimientos);
  });

  it("denies creation to the cashier role", async () => {
    const denied = await handler.create(caja, { clienteId: "c_1", total: 100 });
    expect(denied).toMatchObject({ ok: false, error: { code: ERROR_CODES.FORBIDDEN } });
  });
});

describe("OrderHandler.read/update", () => {
  it("hides foreign orders from list and getById", async () => {
    const listed = await handler.list(vendedor);
    expect(listed.ok && listed.value).toHaveLength(0);

    const foreign = await handler.getById(vendedor, "o_1");
    expect(foreign).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN }
    });

    const visible = await handler.getById(admin, "o_1");
    expect(visible.ok).toBe(true);
  });

  it("advances state with the expected version", async () => {
    const created = await handler.create(tecnico, { clienteId: "c_1", total: 100 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await handler.update(
      tecnico,
      created.value.id,
      { estado: "presupuestado" },
      created.value.version
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value).toMatchObject({ estado: "presupuestado", version: 2 });
  });

  it("rejects stale versions and invalid transitions without mutating", async () => {
    const created = await handler.create(tecnico, { clienteId: "c_1", total: 100 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stale = await handler.update(
      tecnico,
      created.value.id,
      { estado: "presupuestado" },
      999
    );
    expect(stale).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });

    const invalid = await handler.update(
      tecnico,
      created.value.id,
      { estado: "entregado" },
      created.value.version
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });

    const current = await handler.getById(tecnico, created.value.id);
    expect(current).toMatchObject({ ok: true, value: { estado: "en_diagnostico", version: 1 } });
  });

  it("restricts payment changes to the cashier role", async () => {
    const owned = await handler.create(tecnico, { clienteId: "c_1", total: 100 });
    expect(owned.ok).toBe(true);
    if (!owned.ok) return;

    const denied = await handler.update(
      tecnico,
      owned.value.id,
      { paymentStatus: "pagado" },
      owned.value.version
    );
    expect(denied).toMatchObject({ ok: false, error: { code: ERROR_CODES.FORBIDDEN } });

    const created = await handler.create(admin, { clienteId: "c_1", total: 100 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const paid = await handler.update(
      admin,
      created.value.id,
      { paymentStatus: "pagado" },
      created.value.version
    );
    expect(paid).toMatchObject({ ok: true, value: { paymentStatus: "pagado" } });
  });
});
