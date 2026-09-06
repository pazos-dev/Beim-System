import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createVentaUseCases } from "../composition/ventas";
import { ERROR_CODES } from "../handlers/errors";
import type { AuthActor } from "../handlers/auth";
import { toVentaActor } from "./ventas";
import { createSeedDirectory } from "../../test/seed-dir";

function actor(username: string, role: AuthActor["role"], id: string): AuthActor {
  return { id, username, displayName: username, role };
}

const seller = actor("vendedor", "vendedor", "u-vendedor");
const cashier = actor("caja", "caja", "u-caja");
const admin = actor("administrador", "administrador", "u-administrador");

function saleInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    items: [{ productoId: "p_1", cantidad: 1 }],
    pagos: [{ metodo: "efectivo", monto: 1200 }],
    ...overrides
  };
}

async function fileJson(directory: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(directory, name), "utf8")) as Record<string, unknown>;
}

describe("VentaUseCases.create (VTA-2)", () => {
  it("ignores client precio and prices from the catalog", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-precio-");
    try {
      const created = await createVentaUseCases(directory).create(toVentaActor(seller), {
        items: [{ productoId: "p_1", cantidad: 1, precio: 1 }],
        pagos: [{ metodo: "efectivo", monto: 1200 }]
      }, "key-precio-ignored");
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.total).toBe(1200);
      expect(created.value.items[0]).toMatchObject({ productoId: "p_1", cantidad: 1, precio: 1200 });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns CONFLICT on insufficient stock with nothing persisted", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-409-");
    try {
      const before = {
        productos: await fileJson(directory, "productos.json"),
        ventas: await fileJson(directory, "ventas.json"),
        movimientos: await fileJson(directory, "movimientos-stock.json")
      };
      const created = await createVentaUseCases(directory).create(
        toVentaActor(seller),
        saleInput({ items: [{ productoId: "p_2", cantidad: 5 }], pagos: [{ metodo: "efectivo", monto: 3000 }] }),
        "key-insufficient-409"
      );
      expect(created.ok).toBe(false);
      if (created.ok) return;
      expect(created.error.code).toBe(ERROR_CODES.CONFLICT);
      expect(await fileJson(directory, "productos.json")).toEqual(before.productos);
      expect(await fileJson(directory, "ventas.json")).toEqual(before.ventas);
      expect(await fileJson(directory, "movimientos-stock.json")).toEqual(before.movimientos);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns CONFLICT on duplicate numero", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-dup-");
    try {
      const created = await createVentaUseCases(directory).create(
        toVentaActor(admin),
        saleInput({ numero: "0001-000101" }),
        "key-duplicate-numero"
      );
      expect(created.ok).toBe(false);
      if (created.ok) return;
      expect(created.error.code).toBe(ERROR_CODES.CONFLICT);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("replays the same key once without duplicating the sale", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-replay-");
    try {
      const useCases = createVentaUseCases(directory);
      const input = saleInput();
      const first = await useCases.create(toVentaActor(seller), input, "key-replay-once");
      const second = await useCases.create(toVentaActor(seller), input, "key-replay-once");
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value).toEqual(first.value);
      const ventas = (await fileJson(directory, "ventas.json").then((doc) => doc["ventas"] as unknown[])) ?? [];
      expect(ventas).toHaveLength(3);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns CONFLICT when the same key carries a new payload", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-key-clash-");
    try {
      const useCases = createVentaUseCases(directory);
      const first = await useCases.create(toVentaActor(seller), saleInput(), "key-clash");
      expect(first.ok).toBe(true);
      const second = await useCases.create(
        toVentaActor(seller),
        saleInput({ items: [{ productoId: "p_1", cantidad: 2 }], pagos: [{ metodo: "efectivo", monto: 2400 }] }),
        "key-clash"
      );
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.code).toBe(ERROR_CODES.CONFLICT);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("requires an idempotency key with VALIDATION_ERROR", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-nokey-");
    try {
      const created = await createVentaUseCases(directory).create(toVentaActor(seller), saleInput(), undefined);
      expect(created.ok).toBe(false);
      if (created.ok) return;
      expect(created.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects a foreign ordenId with NOT_FOUND_OR_FORBIDDEN", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-orden-");
    try {
      const created = await createVentaUseCases(directory).create(
        toVentaActor(seller),
        saleInput({ ordenId: "o_1" }),
        "key-foreign-orden"
      );
      expect(created.ok).toBe(false);
      if (created.ok) return;
      expect(created.error.code).toBe(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rolls back the 4-doc commit when the audit hook fails", async () => {
    const directory = await createSeedDirectory("gestion-ventas-create-audit-fail-");
    try {
      const { JsonVentaRepository } = await import("../adapters/json-venta-repository");
      const { err } = await import("../handlers/result");
      const port = new JsonVentaRepository(directory);
      const before = {
        productos: await fileJson(directory, "productos.json"),
        ventas: await fileJson(directory, "ventas.json"),
        movimientos: await fileJson(directory, "movimientos-stock.json"),
        ordenes: await fileJson(directory, "ordenes.json")
      };
      const failed = await port.applyCreate(
        { hasGlobalAccess: true, id: "u-administrador" },
        {
          deltas: [{ productoId: "p_1", cantidad: 1 }],
          draft: {
            items: [{ productoId: "p_1", cantidad: 1, precio: 1200 }],
            pagos: [{ metodo: "efectivo", monto: 1200 }],
            total: 1200,
            ordenId: "o_1"
          }
        },
        async () => err({ code: "AUDIT_FAILURE", message: "Audit is unavailable." })
      );
      expect(failed.ok).toBe(false);
      if (failed.ok) return;
      expect(failed.error.code).toBe("AUDIT_FAILURE");
      // Rollback restores document content (restoreDocument bumps the
      // version counter, so array contents — not versions — are compared).
      expect((await fileJson(directory, "productos.json"))["productos"]).toEqual(before.productos["productos"]);
      expect((await fileJson(directory, "ventas.json"))["ventas"]).toEqual(before.ventas["ventas"]);
      expect((await fileJson(directory, "movimientos-stock.json"))["movimientosStock"]).toEqual(
        before.movimientos["movimientosStock"]
      );
      expect((await fileJson(directory, "ordenes.json"))["ordenes"]).toEqual(before.ordenes["ordenes"]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("VentaUseCases.anular (VTA-3)", () => {
  async function createSale(directory: string): Promise<string> {
    const created = await createVentaUseCases(directory).create(
      toVentaActor(admin),
      saleInput({ ordenId: "o_1" }),
      `key-anular-setup-${Date.now()}-${Math.random()}`
    );
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("Setup sale failed.");
    return created.value.id;
  }

  it("restores stock with reversals and flips the orden to pendiente", async () => {
    const directory = await createSeedDirectory("gestion-ventas-anular-");
    try {
      const useCases = createVentaUseCases(directory);
      const id = await createSale(directory);
      const anulada = await useCases.anular(toVentaActor(admin), id, { motivo: "devolucion" }, "key-anular-1");
      expect(anulada.ok).toBe(true);
      if (!anulada.ok) return;
      expect(anulada.value).toMatchObject({ id, estado: "anulada" });
      expect(itemsOf(await fileJson(directory, "productos.json"), "productos").find((item) => item.id === "p_1")?.stock).toBe(8);
      expect(
        itemsOf(await fileJson(directory, "movimientos-stock.json"), "movimientosStock").filter(
          (move) => move.motivo === "anulacion" && move.referencia === id
        )
      ).toHaveLength(1);
      expect(itemsOf(await fileJson(directory, "ordenes.json"), "ordenes").find((orden) => orden.id === "o_1")?.paymentStatus).toBe(
        "pendiente"
      );
      expect(JSON.stringify(await fileJson(directory, "audit.json"))).toContain("venta.anular");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects vendedor and caja with FORBIDDEN and zero writes", async () => {
    const directory = await createSeedDirectory("gestion-ventas-anular-403-");
    try {
      const useCases = createVentaUseCases(directory);
      const id = await createSale(directory);
      const before = {
        productos: await fileJson(directory, "productos.json"),
        ventas: await fileJson(directory, "ventas.json"),
        movimientos: await fileJson(directory, "movimientos-stock.json"),
        audit: await fileJson(directory, "audit.json")
      };
      for (const who of [seller, cashier]) {
        const denied = await useCases.anular(toVentaActor(who), id, { motivo: "devolucion" }, `key-403-${who.username}`);
        expect(denied.ok).toBe(false);
        if (denied.ok) return;
        expect(denied.error.code).toBe(ERROR_CODES.FORBIDDEN);
      }
      expect(await fileJson(directory, "productos.json")).toEqual(before.productos);
      expect(await fileJson(directory, "ventas.json")).toEqual(before.ventas);
      expect(await fileJson(directory, "movimientos-stock.json")).toEqual(before.movimientos);
      expect(await fileJson(directory, "audit.json")).toEqual(before.audit);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("requires motivo and an idempotency key with VALIDATION_ERROR", async () => {
    const directory = await createSeedDirectory("gestion-ventas-anular-400-");
    try {
      const useCases = createVentaUseCases(directory);
      const id = await createSale(directory);
      for (const bad of [
        { input: { motivo: "" }, key: "key-bad-motivo" },
        { input: { motivo: "devolucion" }, key: undefined }
      ]) {
        const rejected = await useCases.anular(toVentaActor(admin), id, bad.input, bad.key);
        expect(rejected.ok).toBe(false);
        if (rejected.ok) return;
        expect(rejected.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("treats re-annul as a no-op returning the current sale", async () => {
    const directory = await createSeedDirectory("gestion-ventas-anular-noop-");
    try {
      const useCases = createVentaUseCases(directory);
      const id = await createSale(directory);
      const first = await useCases.anular(toVentaActor(admin), id, { motivo: "devolucion" }, "key-noop-1");
      const second = await useCases.anular(toVentaActor(admin), id, { motivo: "devolucion" }, "key-noop-2");
      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value).toEqual(first.value);
      expect(
        itemsOf(await fileJson(directory, "movimientos-stock.json"), "movimientosStock").filter(
          (move) => move.motivo === "anulacion" && move.referencia === id
        )
      ).toHaveLength(1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

function itemsOf(doc: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  return doc[key] as Array<Record<string, unknown>>;
}
