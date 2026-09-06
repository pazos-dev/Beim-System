import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { Venta } from "../data/schemas";
import { err, ok } from "../handlers/result";
import type { VentaRepositoryPort } from "../ports/ventas";
import { JsonVentaRepository } from "./json-venta-repository";
import { StubApiVentaRepository } from "../../test/stub-api-venta-repository";

function ventaFixture(id: string, ownerId: string, estado: Venta["estado"], numero: string): Venta {
  return {
    id,
    ownerId,
    version: 1,
    numero,
    items: [{ productoId: "p_1", cantidad: 1, precio: 100 }],
    pagos: [{ metodo: "efectivo", monto: 100 }],
    total: 100,
    estado
  };
}

function fullSeed(): Venta[] {
  return [
    ventaFixture("v_1", "u-mine", "confirmada", "0001-000101"),
    ventaFixture("v_2", "u-other", "confirmada", "0001-000102"),
    ventaFixture("v_3", "u-mine", "anulada", "0001-000103")
  ];
}

async function runContractSuite(name: string, makePort: () => Promise<VentaRepositoryPort>) {
  describe(name, () => {
    it("lists only visible ventas (ownership filter)", async () => {
      const port = await makePort();
      const mine = await port.list({ id: "u-mine", hasGlobalAccess: false });
      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      expect(mine.value.map((venta) => venta.id).sort()).toEqual(["v_1", "v_3"]);
      const other = await port.list({ id: "u-other", hasGlobalAccess: false });
      expect(other.ok && other.value.map((venta) => venta.id)).toEqual(["v_2"]);
      const global = await port.list({ id: "u-admin", hasGlobalAccess: true });
      expect(global.ok && global.value.length).toBe(3);
    });

    it("hides foreign ventas on getById", async () => {
      const port = await makePort();
      const foreign = await port.getById({ id: "u-mine", hasGlobalAccess: false }, "v_2");
      expect(foreign.ok).toBe(false);
      if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      const own = await port.getById({ id: "u-mine", hasGlobalAccess: false }, "v_1");
      expect(own.ok).toBe(true);
    });

    it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids", async () => {
      const port = await makePort();
      const found = await port.getById({ id: "u-mine", hasGlobalAccess: false }, "missing");
      expect(found.ok).toBe(false);
      if (!found.ok) expect(found.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    });

    it("rejects blank ids with VALIDATION_ERROR", async () => {
      const port = await makePort();
      const found = await port.getById({ id: "u-mine", hasGlobalAccess: false }, "  ");
      expect(found.ok).toBe(false);
      if (!found.ok) expect(found.error.code).toBe("VALIDATION_ERROR");
    });

    it("persists creates through the audit hook", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      let audited = 0;
      const created = await port.applyCreate(
        actor,
        { venta: ventaFixture("v_new", "u-mine", "confirmada", "0001-000199") },
        async () => {
          audited += 1;
          return ok(undefined);
        }
      );
      expect(created.ok).toBe(true);
      expect(audited).toBe(1);
      const found = await port.getById(actor, "v_new");
      expect(found.ok).toBe(true);
    });

    it("rolls back the create when the audit hook fails", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      const created = await port.applyCreate(
        actor,
        { venta: ventaFixture("v_ghost", "u-mine", "confirmada", "0001-000198") },
        async () => err({ code: "AUDIT_FAILURE", message: "Audit is unavailable." })
      );
      expect(created.ok).toBe(false);
      const found = await port.getById(actor, "v_ghost");
      expect(found.ok).toBe(false);
      const listed = await port.list(actor);
      expect(listed.ok && listed.value.some((venta) => venta.id === "v_ghost")).toBe(false);
    });
  });
}

const jsonDirs: string[] = [];

runContractSuite("JsonVentaRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-venta-contract-"));
  jsonDirs.push(directory);
  await writeFile(
    join(directory, "ventas.json"),
    JSON.stringify({ version: 1, ventas: fullSeed() }),
    "utf8"
  );
  return new JsonVentaRepository(directory);
});

runContractSuite("StubApiVentaRepository contract", async () => new StubApiVentaRepository());

afterAll(async () => {
  for (const directory of jsonDirs) await rm(directory, { force: true, recursive: true });
});

describe("contract suite wiring", () => {
  it("registers both implementations", () => {
    expect(JsonVentaRepository).toBeDefined();
    expect(StubApiVentaRepository).toBeDefined();
  });
});
