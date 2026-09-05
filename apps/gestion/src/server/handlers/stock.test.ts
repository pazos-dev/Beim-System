import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weightedAverageCost } from "../../lib/domain/inventory/inventory";
import { ERROR_CODES } from "./errors";
import { createSeedDirectory } from "../../test/seed-dir";
import { createStockStores, StockHandler, type StockActor } from "./stock";
const admin: StockActor = { id: "u-administrador", role: "administrador", hasGlobalAccess: true };
const seller: StockActor = { id: "u-vendedor", role: "vendedor", hasGlobalAccess: false };
let directory = "";
let handler: StockHandler;
async function fileJson(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(directory, name), "utf8")) as Record<string, unknown>;
}
beforeEach(async () => {
  directory = await createSeedDirectory("gestion-stock-");
  handler = new StockHandler(createStockStores(directory));
});
afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});
describe("StockHandler", () => {
  it("computes exact weighted cost with decimals on purchase", async () => {
    expect(weightedAverageCost(8, 800, 4, 850)).toBe(816.67);
    const result = await handler.registerPurchase(admin, {
      productoId: "p_1", cantidad: 4, costoUnitario: 850, proveedor: "Proveedor SA"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.producto.stock).toBe(12);
    expect(result.value.producto.cost).toBe(816.67);
    expect(result.value.movimiento).toMatchObject({ cantidad: 4, motivo: "compra", balanceAfter: 12 });
  });
  it("registers paired transfer movements with both balances", async () => {
    const result = await handler.transfer(admin, {
      productoId: "p_1", cantidad: 2, origen: "principal", destino: "taller"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [out, inn] = result.value.movimientos;
    expect(out).toMatchObject({ cantidad: -2, motivo: "transferencia", balanceAfter: 2 });
    expect(inn).toMatchObject({ cantidad: 2, motivo: "transferencia", balanceAfter: 2 });
    expect(out?.referencia).toBe(inn?.referencia);
    expect(out?.deposito).toBe("principal");
    expect(inn?.deposito).toBe("taller");
  });
  it("rolls back purchase writes when movement persistence fails", async () => {
    const stores = createStockStores(directory);
    const failing = new StockHandler(stores);
    vi.spyOn(stores.movimientos, "write").mockResolvedValueOnce({
      ok: false, error: { code: "CONFLICT", message: "stale", reason: "VERSION" }
    });
    const before = { compras: await fileJson("compras.json"), productos: await fileJson("productos.json"), moves: await fileJson("movimientos-stock.json") };
    const result = await failing.registerPurchase(admin, {
      productoId: "p_1", cantidad: 1, costoUnitario: 800, proveedor: "Proveedor SA"
    });
    expect(result.ok).toBe(false);
    expect((await fileJson("compras.json"))["compras"]).toEqual(before.compras["compras"]);
    expect((await fileJson("productos.json"))["productos"]).toEqual(before.productos["productos"]);
    expect((await fileJson("movimientos-stock.json"))["movimientosStock"]).toEqual(before.moves["movimientosStock"]);
  });
  it("blocks outflow when stock is insufficient", async () => {
    const before = await fileJson("movimientos-stock.json");
    const result = await handler.registerOutflow(admin, { productoId: "p_2", cantidad: 5, motivo: "venta" });
    expect(result).toMatchObject({ ok: false, error: { code: ERROR_CODES.CONFLICT } });
    expect(await fileJson("movimientos-stock.json")).toEqual(before);
  });
  it("hides foreign-owned products from other actors", async () => {
    const stock = await handler.getStock(seller, "p_1");
    expect(stock).toMatchObject({ ok: false, error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN } });
    const purchase = await handler.registerPurchase(seller, {
      productoId: "p_1", cantidad: 1, costoUnitario: 100, proveedor: "Proveedor SA"
    });
    expect(purchase).toMatchObject({ ok: false });
  });
});
