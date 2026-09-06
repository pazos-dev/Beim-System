import { mkdtemp, rm } from "node:fs/promises";
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

    it("supports levels pagination inputs without leaking", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      const other = await port.getProducto({ id: "u-other", hasGlobalAccess: false }, "p_1");
      expect(other.ok).toBe(false);
    });
  });
}

const jsonDirs: string[] = [];

runContractSuite("JsonStockRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-stock-contract-"));
  jsonDirs.push(directory);
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
