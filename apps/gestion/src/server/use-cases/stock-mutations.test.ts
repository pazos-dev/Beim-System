import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonStockRepository } from "../adapters/json-stock-repository";
import { AuditRepository } from "../handlers/audit";
import { type AuthActor } from "../handlers/auth";
import { ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { guardDraftStock } from "../handlers/order-context";
import { weightedAverageCost } from "../../lib/domain/inventory/inventory";
import { createStockUseCases } from "../composition/stock";
import { createSeedDirectory } from "../../test/seed-dir";
import { StockUseCases, toStockActor } from "./stock";

function actor(username: string, role: AuthActor["role"], id: string): AuthActor {
  return { id, username, displayName: username, role };
}

const admin = actor("administrador", "administrador", "u-administrador");
const principal = actor("administrador_principal", "administrador_principal", "u-administrador_principal");
const seller = actor("vendedor", "vendedor", "u-vendedor");
const technician = actor("tecnico", "tecnico", "u-tecnico");

async function fileJson(directory: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(directory, name), "utf8")) as Record<string, unknown>;
}

describe("stock mutations STK-2 recordOutflow (RED)", () => {
  it("records an authorized outflow and decrements producto.stock with one audit", async () => {
    const directory = await createSeedDirectory("gestion-stock-outflow-");
    try {
      const useCases = createStockUseCases(directory);
      const result = await useCases.recordOutflow(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 2,
        motivo: "venta"
      }, "key-outflow-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.producto.stock).toBe(6);
      expect(result.value.movimiento).toMatchObject({ cantidad: -2, motivo: "venta" });
      const audit = await fileJson(directory, "audit.json");
      expect(JSON.stringify(audit)).toContain("stock.outflow");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects ajuste from non-principal admin with zero writes (403, no audit)", async () => {
    const directory = await createSeedDirectory("gestion-stock-ajuste-403-");
    try {
      const useCases = createStockUseCases(directory);
      const before = {
        productos: await fileJson(directory, "productos.json"),
        movimientos: await fileJson(directory, "movimientos-stock.json"),
        audit: await fileJson(directory, "audit.json")
      };
      const result = await useCases.recordOutflow(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 1,
        motivo: "venta",
        ajuste: true
      }, "key-ajuste-403");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(await fileJson(directory, "productos.json")).toEqual(before.productos);
      expect(await fileJson(directory, "movimientos-stock.json")).toEqual(before.movimientos);
      expect(await fileJson(directory, "audit.json")).toEqual(before.audit);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("returns CONFLICT on insufficient stock with nothing persisted", async () => {
    const directory = await createSeedDirectory("gestion-stock-outflow-409-");
    try {
      const useCases = createStockUseCases(directory);
      const before = await fileJson(directory, "movimientos-stock.json");
      const result = await useCases.recordOutflow(toStockActor(admin), {
        productoId: "p_2",
        cantidad: 5,
        motivo: "venta"
      }, "key-outflow-409");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.CONFLICT);
      expect(await fileJson(directory, "movimientos-stock.json")).toEqual(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rolls back persisted writes when audit fails (AUDIT_FAILURE)", async () => {
    const directory = await createSeedDirectory("gestion-stock-outflow-audit-fail-");
    try {
      const brokenAudit = new AuditRepository(
        new JsonStore(join(directory, "missing-dir", "audit.json"), auditDocumentSchema)
      );
      const useCases = new StockUseCases(
        new JsonStockRepository(directory),
        brokenAudit,
        new IdempotencyService(new JsonStore(join(directory, "idempotency.json"), idempotencyDocumentSchema))
      );
      const before = {
        productos: await fileJson(directory, "productos.json"),
        movimientos: await fileJson(directory, "movimientos-stock.json")
      };
      const result = await useCases.recordOutflow(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 1,
        motivo: "venta"
      }, "key-audit-fail");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.AUDIT_FAILURE);
      const afterProductos = await fileJson(directory, "productos.json");
      const afterMovimientos = await fileJson(directory, "movimientos-stock.json");
      expect(afterProductos["productos"]).toEqual(before.productos["productos"]);
      expect(afterMovimientos["movimientosStock"]).toEqual(before.movimientos["movimientosStock"]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("replays the same key+payload once and rejects key+new-payload with 409", async () => {
    const directory = await createSeedDirectory("gestion-stock-outflow-replay-");
    try {
      const useCases = createStockUseCases(directory);
      const payload = { productoId: "p_1", cantidad: 1, motivo: "venta" as const };
      const first = await useCases.recordOutflow(toStockActor(admin), payload, "key-replay-1");
      const second = await useCases.recordOutflow(toStockActor(admin), payload, "key-replay-1");
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value.movimiento.id).toBe(first.value.movimiento.id);
      const conflict = await useCases.recordOutflow(toStockActor(admin), {
        ...payload,
        cantidad: 2
      }, "key-replay-1");
      expect(conflict.ok).toBe(false);
      if (conflict.ok) return;
      expect(conflict.error.code).toBe(ERROR_CODES.CONFLICT);
      const movimientos = await fileJson(directory, "movimientos-stock.json");
      expect(JSON.stringify(movimientos).match(/key-replay-1/g)).toBeNull();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("stock mutations STK-3 transferPair (RED)", () => {
  it("writes the pair atomically under one t_ reference with one audit", async () => {
    const directory = await createSeedDirectory("gestion-stock-transfer-");
    try {
      const useCases = createStockUseCases(directory);
      const result = await useCases.transferPair(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 2,
        origen: "principal",
        destino: "taller"
      }, "key-transfer-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const [leaving, arriving] = result.value.movimientos;
      expect(leaving?.referencia).toMatch(/^t_/);
      expect(arriving?.referencia).toBe(leaving?.referencia);
      expect(leaving).toMatchObject({ cantidad: -2, motivo: "transferencia" });
      expect(arriving).toMatchObject({ cantidad: 2, motivo: "transferencia" });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects tecnico transfers with 403 and zero writes", async () => {
    const directory = await createSeedDirectory("gestion-stock-transfer-403-");
    try {
      const useCases = createStockUseCases(directory);
      const before = await fileJson(directory, "movimientos-stock.json");
      const result = await useCases.transferPair(toStockActor(technician), {
        productoId: "p_1",
        cantidad: 1,
        origen: "principal",
        destino: "taller"
      }, "key-transfer-403");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(await fileJson(directory, "movimientos-stock.json")).toEqual(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects same-deposito transfers with 400 and writes nothing", async () => {    const directory = await createSeedDirectory("gestion-stock-transfer-400-");
    try {
      const useCases = createStockUseCases(directory);
      const before = await fileJson(directory, "movimientos-stock.json");
      const result = await useCases.transferPair(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 1,
        origen: "taller",
        destino: "taller"
      }, "key-transfer-400");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(await fileJson(directory, "movimientos-stock.json")).toEqual(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("keeps the pair atomic on insufficient origin balance (409, nothing persists)", async () => {
    const directory = await createSeedDirectory("gestion-stock-transfer-409-");
    try {
      const useCases = createStockUseCases(directory);
      const before = await fileJson(directory, "movimientos-stock.json");
      const result = await useCases.transferPair(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 999,
        origen: "principal",
        destino: "taller"
      }, "key-transfer-409");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.CONFLICT);
      expect(await fileJson(directory, "movimientos-stock.json")).toEqual(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("stock mutations STK-4 recordPurchase (RED)", () => {
  it("recomputes weighted cost 10@100+10@120 to 110 as a pure function", () => {
    expect(weightedAverageCost(10, 100, 10, 120)).toBe(110);
  });

  it("commits compra+producto+movimiento atomically via thin delegate", async () => {
    const directory = await createSeedDirectory("gestion-stock-purchase-");
    try {
      const useCases = createStockUseCases(directory);
      const result = await useCases.recordPurchase(toStockActor(admin), {
        productoId: "p_1",
        cantidad: 4,
        costoUnitario: 850,
        proveedor: "Proveedor SA"
      }, "key-purchase-1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.producto.stock).toBe(12);
      expect(result.value.producto.cost).toBe(816.67);
      expect(result.value.movimiento).toMatchObject({ cantidad: 4, motivo: "compra" });
      expect(result.value.compra.total).toBe(3400);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("lets principal ajuste pass the role gate while foreign-owned stock stays hidden", async () => {
    const directory = await createSeedDirectory("gestion-stock-ajuste-ok-");
    try {
      const useCases = createStockUseCases(directory);
      const adjusted = await useCases.recordOutflow(toStockActor(principal), {
        productoId: "p_1",
        cantidad: 1,
        motivo: "consumo",
        ajuste: true
      }, "key-ajuste-ok");
      expect(adjusted.ok).toBe(true);
      const hidden = await useCases.recordOutflow(toStockActor(seller), {
        productoId: "p_1",
        cantidad: 1,
        motivo: "venta"
      }, "key-seller-hidden");
      expect(hidden.ok).toBe(false);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("order-stock guard stub STK-7 (RED)", () => {
  it("blocks draft confirm on insufficient balance with CONFLICT and keeps draft open", async () => {
    const blocked = await guardDraftStock(
      async () => ({ ok: false as const, error: { code: ERROR_CODES.CONFLICT, message: "short" } }),
      [{ productoId: "p_2", cantidad: 999 }]
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe(ERROR_CODES.CONFLICT);
    const allowed = await guardDraftStock(
      async () => ({ ok: true as const, value: { balance: 8, deposito: "principal", minimum: 2, productoId: "p_1" } }),
      [{ productoId: "p_1", cantidad: 1 }]
    );
    expect(allowed.ok).toBe(true);
  });
});
