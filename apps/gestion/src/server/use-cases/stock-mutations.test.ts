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
