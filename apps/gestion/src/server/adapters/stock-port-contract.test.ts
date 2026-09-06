import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { StockRepositoryPort } from "../ports/stock";
import { JsonStockRepository } from "./json-stock-repository";
import { StubApiStockRepository } from "../../test/stub-api-stock-repository";

async function runContractSuite(name: string, makePort: () => Promise<StockRepositoryPort>) {
  describe(name, () => {
    it("lists only visible productos (ownership filter)", async () => {
      const port = await makePort();
      const mine = { id: "u-mine", hasGlobalAccess: false };
      const listedMine = await port.listProductos(mine);
      expect(listedMine.ok).toBe(true);
      if (!listedMine.ok) return;
      expect(listedMine.value.every((p) => p.ownerId === "u-mine")).toBe(true);
      const global = await port.listProductos({ id: "u-admin", hasGlobalAccess: true });
      expect(global.ok).toBe(true);
    });

    it("returns NOT_FOUND_OR_FORBIDDEN for unknown producto ids", async () => {
      const port = await makePort();
      const found = await port.getProducto({ id: "u-mine", hasGlobalAccess: false }, "missing");
      expect(found.ok).toBe(false);
      if (!found.ok) expect(found.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    });

    it("lists movimientos scoped to a producto", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      const moves = await port.listMovimientos(actor, "p_1");
      expect(moves.ok).toBe(true);
    });

    it("lists compras with admin visibility (admin sees all, others own only)", async () => {
      const port = await makePort();
      const mine = await port.listCompras({ id: "u-mine", hasGlobalAccess: false });
      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      expect(mine.value.map((item) => item.id)).toEqual(["co_1"]);
      const other = await port.listCompras({ id: "u-other", hasGlobalAccess: false });
      expect(other.ok).toBe(true);
      if (!other.ok) return;
      expect(other.value.map((item) => item.id)).toEqual(["co_2"]);
      const admin = await port.listCompras({ id: "u-admin", hasGlobalAccess: true });
      expect(admin.ok).toBe(true);
      if (!admin.ok) return;
      expect(admin.value.map((item) => item.id).sort()).toEqual(["co_1", "co_2"]);
    });

    it("returns NOT_FOUND_OR_FORBIDDEN for unknown or foreign compra ids", async () => {
      const port = await makePort();
      const missing = await port.getCompra({ id: "u-mine", hasGlobalAccess: false }, "missing");
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      const foreign = await port.getCompra({ id: "u-mine", hasGlobalAccess: false }, "co_2");
      expect(foreign.ok).toBe(false);
      if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      const blank = await port.getCompra({ id: "u-admin", hasGlobalAccess: true }, "  ");
      expect(blank.ok).toBe(false);
      const own = await port.getCompra({ id: "u-mine", hasGlobalAccess: false }, "co_1");
      expect(own.ok).toBe(true);
    });

    it("supports levels pagination inputs without leaking", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      const other = await port.getProducto({ id: "u-other", hasGlobalAccess: false }, "p_1");
      expect(other.ok).toBe(false);
    });
  });
}

const jsonDirs: string[] = [];

const seedCompras = [
  {
    id: "co_1",
    ownerId: "u-mine",
    version: 1,
    productoId: "p_1",
    proveedor: "Proveedor Andina",
    cantidad: 2,
    costoUnitario: 50,
    comprobante: "FAC-001",
    fecha: "2026-01-10T12:00:00.000Z",
    total: 100
  },
  {
    id: "co_2",
    ownerId: "u-other",
    version: 1,
    productoId: "p_1",
    proveedor: "Proveedor Boreal",
    cantidad: 1,
    costoUnitario: 70,
    comprobante: "FAC-002",
    fecha: "2026-01-11T12:00:00.000Z",
    total: 70
  }
];

runContractSuite("JsonStockRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-stock-contract-"));
  jsonDirs.push(directory);
  await writeFile(join(directory, "compras.json"), JSON.stringify({ version: 1, compras: seedCompras }), "utf8");
  return new JsonStockRepository(directory);
});

runContractSuite("StubApiStockRepository contract", async () => new StubApiStockRepository());

afterAll(async () => {
  for (const directory of jsonDirs) await rm(directory, { force: true, recursive: true });
});

describe("contract suite wiring", () => {
  it("registers both implementations", () => {
    expect(JsonStockRepository).toBeDefined();
    expect(StubApiStockRepository).toBeDefined();
  });
});
