/**
 * Service-layer tests for the gestion module (PR 3) against the shared test
 * database (beim_api_test, see src/db/testDb.ts).
 *
 * These tests exercise the transactional core directly (sales-batch atomicity,
 * annul restore + reversal, cash-session gates, financial-state merge) before
 * the HTTP layer. The HTTP surface is covered by gestion-api.test.ts.
 */
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import { ConflictError, InsufficientStockError, NotFoundError, ValidationError } from "../../errors/taxonomy.js";
import { withTransaction } from "../../db/withTransaction.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top.
const { query } = await import("../../config/db.js");
const { salesBatchService } = await import("./services/sales-batch.js");
const { receiptsService } = await import("./services/receipts.js");
const { financialStateService } = await import("./services/financial-state.js");
const { cashSessionsService } = await import("./services/cash-sessions.js");
const { stockMovementsService } = await import("./services/stock-movements.js");
const { clientsService } = await import("./services/crud.js");
const { categoriesService } = await import("./services/crud.js");
const { servicesService } = await import("./services/crud.js");
const { purchasesService } = await import("./services/crud.js");

const TODAY = localToday();

/**
 * Local calendar date (YYYY-MM-DD). `created_at::date` is evaluated in the
 * DB session timezone, so a UTC date flips a day early/late around midnight
 * (America/Montevideo); the runner shares that zone, keeping "today"
 * aligned on both sides.
 */
function localToday(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Seeds a product with a known price + stock; returns its id. */
async function seedProduct(id: string, stock: number, price: number): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description)
     VALUES ($1, 'Svc seed', 'celulares', '', '', $3, 'UYU', $2, 'Nuevo', '')
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price, updated_at = now()`,
    [id, stock, price]
  );
  return id;
}

async function readStock(id: string): Promise<number> {
  const { rows } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [id]);
  return rows[0].stock;
}

async function countRows(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n ${sql}`, params);
  return Number(rows[0].n);
}

describePg("sales-batch service", () => {
  it("commits receipt + parts + stock decrements + payment movements atomically", async () => {
    const a = await seedProduct("gsvc-sale-a", 5, 100);
    const b = await seedProduct("gsvc-sale-b", 3, 200);

    const result = await salesBatchService.run({
      clientName: "Cliente Svc",
      clientId: "svc-cli-1",
      items: [
        { productId: a, quantity: 2 },
        { productId: b, quantity: 1 }
      ],
      payments: [{ method: "Efectivo", amount: 400 }]
    });

    // Receipt: number, total, defaults per legacy sales (Entregado).
    expect(result.receipt.receiptNumber).toBeGreaterThanOrEqual(1000);
    expect(result.receipt.repairStatus).toBe("Entregado");
    expect(result.receipt.clientName).toBe("Cliente Svc");
    expect(result.total).toBe(400);
    expect(result.items).toEqual([
      { productId: a, quantity: 2, unitPrice: 100 },
      { productId: b, quantity: 1, unitPrice: 200 }
    ]);

    // Stock consumed; parts and payment movements persisted.
    expect(await readStock(a)).toBe(3);
    expect(await readStock(b)).toBe(2);
    expect(await countRows("FROM beim_receipt_parts WHERE receipt_id = $1", [result.receipt.id])).toBe(2);
    expect(await countRows("FROM beim_receipt_parts WHERE receipt_id = $1 AND stock_decremented", [result.receipt.id])).toBe(2);
    expect(await countRows("FROM gestion_payment_movements WHERE receipt_id = $1", [result.receipt.id])).toBe(1);
  });

  it("ROLLS BACK the whole transaction when a later item has insufficient stock (no partial decrement, no receipt, no parts, no movements)", async () => {
    const a = await seedProduct("gsvc-rollback-a", 5, 100);
    const c = await seedProduct("gsvc-rollback-c", 1, 50);

    await expect(
      salesBatchService.run({
        clientName: "Debe rodar atras",
        clientId: "svc-cli-2",
        items: [
          { productId: a, quantity: 2 },
          { productId: c, quantity: 2 } // stock 1 — second item fails
        ],
        payments: [{ method: "Efectivo", amount: 300 }]
      })
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(await readStock(a)).toBe(5); // first decrement undone
    expect(await readStock(c)).toBe(1);
    expect(await countRows("FROM beim_receipts WHERE client_id = $1", ["svc-cli-2"])).toBe(0);
    expect(await countRows("FROM gestion_payment_movements")).toBeLessThanOrEqual(2); // only the successful suite's row
  });

  it("rejects qty above stock with 409 InsufficientStockError reporting current stock", async () => {
    const a = await seedProduct("gsvc-low-a", 1, 100);
    await expect(
      salesBatchService.run({
        clientName: "Cliente Low",
        clientId: "svc-cli-3",
        items: [{ productId: a, quantity: 5 }]
      })
    ).rejects.toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK", details: { currentStock: 1 } });
    expect(await readStock(a)).toBe(1);
  });

  it("rejects payments that do not sum to the server-derived total (422 ValidationError)", async () => {
    const a = await seedProduct("gsvc-pay-a", 4, 100);
    await expect(
      salesBatchService.run({
        clientName: "Cliente Pay",
        clientId: "svc-cli-4",
        items: [{ productId: a, quantity: 2 }],
        payments: [{ method: "Efectivo", amount: 150 }]
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await readStock(a)).toBe(4);
    expect(await countRows("FROM beim_receipts WHERE client_id = $1", ["svc-cli-4"])).toBe(0);
  });
});

describePg("receipts service", () => {
  it("annul restores stock, marks Cancelado / Sin abonar / price 0 and reverses payment movements; second annul -> 409", async () => {
    const a = await seedProduct("gsvc-annul-a", 5, 100);
    const batch = await salesBatchService.run({
      clientName: "Para anular",
      clientId: "svc-cli-5",
      items: [{ productId: a, quantity: 2 }],
      payments: [{ method: "Efectivo", amount: 200 }]
    });
    expect(await readStock(a)).toBe(3);

    const annulled = await receiptsService.annul(batch.receipt.id);
    expect(annulled.restoredItems).toEqual([{ productId: a, quantity: 2 }]);
    expect(annulled.reversedMovements).toBe(1);
    expect(annulled.receipt.repairStatus).toBe("Cancelado");
    expect(annulled.receipt.paymentStatus).toBe("Sin abonar");
    expect(annulled.receipt.price).toBe("0");
    expect(await readStock(a)).toBe(5);

    // Financial correction: the reversal movement offsets the original.
    const { rows } = await query<{ amount: string; payment_status: string }>(
      "SELECT amount, payment_status FROM gestion_payment_movements WHERE receipt_id = $1 ORDER BY id",
      [batch.receipt.id]
    );
    expect(rows.map((r) => Number(r.amount))).toEqual([200, -200]);
    expect(rows[1].payment_status).toBe("Anulado");

    await expect(receiptsService.annul(batch.receipt.id)).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT"
    });
    expect(await readStock(a)).toBe(5); // no double restore
  });

  it("annuls a receipt that never consumed stock: marks Cancelado, does not touch stock", async () => {
    const receipt = await receiptsService.create({
      clientName: "Sin stock",
      clientId: "svc-cli-6",
      price: "500",
      payload: {}
    });
    const annulled = await receiptsService.annul(receipt.id);
    expect(annulled.receipt.repairStatus).toBe("Cancelado");
    expect(annulled.restoredItems).toEqual([]);
    expect(annulled.reversedMovements).toBe(0);
  });

  it("annuls an unknown receipt with 404", async () => {
    await expect(
      receiptsService.annul("00000000-0000-0000-0000-000000000000")
    ).rejects.toMatchObject({ status: 404 });
  });

  it("lists receipts filtered by client name and payment method, with pagination", async () => {
    const a = await seedProduct("gsvc-list-a", 10, 100);
    const first = await salesBatchService.run({
      clientName: "Filtrable Uno",
      clientId: "svc-cli-7",
      items: [{ productId: a, quantity: 1 }],
      payments: [{ method: "Efectivo", amount: 100 }]
    });
    await salesBatchService.run({
      clientName: "Filtrable Dos",
      clientId: "svc-cli-8",
      items: [{ productId: a, quantity: 1 }],
      payments: [{ method: "Tarjeta", amount: 100 }]
    });

    const byClient = await receiptsService.list({ client: "filtrable uno" });
    expect(byClient.total).toBe(1);
    expect(byClient.items[0].id).toBe(first.receipt.id);

    const byMethod = await receiptsService.list({ paymentMethod: "Tarjeta" });
    expect(byMethod.total).toBe(1);
    expect(byMethod.items[0].clientName).toBe("Filtrable Dos");

    const both = await receiptsService.list({ client: "filtrable", limit: 1, page: 1 });
    expect(both.items).toHaveLength(1);
    expect(both.total).toBe(2);
    expect(both.page).toBe(1);
    const pageTwo = await receiptsService.list({ client: "filtrable", limit: 1, page: 2 });
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.items[0].id).not.toBe(both.items[0].id);
  });

  it("getById returns null for an unknown receipt", async () => {
    expect(await receiptsService.getById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("nextNumber previews a receipt number >= 1000 without advancing the sequence", async () => {
    const before = await receiptsService.nextNumber();
    const after = await receiptsService.nextNumber();
    expect(before).toBeGreaterThanOrEqual(1000);
    expect(after).toBe(before);
  });
});

describePg("financial-state service", () => {
  it("get returns the default singleton when no row exists", async () => {
    await withTransaction(async (tx) => {
      await tx.query("DELETE FROM gestion_financial_state");
    });
    const state = await financialStateService.get();
    expect(state.capitalInitial).toBe(0);
    expect(state.expenses).toEqual([]);
    expect(state.menuItems).toEqual([]);
    expect(state.accountingState).toEqual({});
    expect(state.preferences).toEqual({});
  });

  it("upsert merges: preserves fields not present in the payload", async () => {
    await financialStateService.upsert({
      capitalInitial: 1000,
      preferences: { theme: "dark", customFlag: true }
    });
    const merged = await financialStateService.upsert({
      expenses: [{ name: "Alquiler", amount: 200 }]
    });
    expect(merged.capitalInitial).toBe(1000);
    expect(merged.preferences).toEqual({ theme: "dark", customFlag: true });
    expect(merged.expenses).toEqual([{ name: "Alquiler", amount: 200 }]);
    expect(merged.singletonId).toBe(1);
  });

  it("rejects negative capitalInitial with 422 ValidationError", async () => {
    await expect(
      financialStateService.upsert({ capitalInitial: -5 })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects negative cash amounts inside accountingState.openingBalances with 422 ValidationError", async () => {
    await expect(
      financialStateService.upsert({
        accountingState: { openingBalances: { cash: 100, bank: -20 } }
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describePg("cash-sessions service", () => {
  it("opens a session, rejects a second open (any date) with 409, and reports the current one", async () => {
    const opened = await cashSessionsService.open({
      businessDate: "2099-01-01",
      openingAmount: 500,
      notes: "apertura"
    });
    expect(opened.status).toBe("open");
    expect(opened.expectedAmount).toBe(500);
    expect(opened.openingAmount).toBe(500);

    await expect(
      cashSessionsService.open({ businessDate: "2099-01-02", openingAmount: 500 })
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" }); // already open

    await expect(
      cashSessionsService.open({ businessDate: "2099-01-01", openingAmount: 500 })
    ).rejects.toMatchObject({ status: 409 }); // same business date

    const current = await cashSessionsService.current();
    expect(current?.id).toBe(opened.id);

    // Cleanup: leave no open session so the following suites can open their own.
    await cashSessionsService.close(opened.id, 500);
    expect(await cashSessionsService.current()).toBeNull();
  });

  it("closes an open session computing the difference; double close and unknown close fail", async () => {
    const { id } = await cashSessionsService.open({
      businessDate: "2099-02-01",
      openingAmount: 500,
      notes: ""
    });
    const closed = await cashSessionsService.close(id, 400);
    expect(closed.status).toBe("closed");
    expect(closed.countedAmount).toBe(400);
    expect(closed.difference).toBe(-100); // counted - expected

    await expect(cashSessionsService.close(id, 400)).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT"
    });
    await expect(
      cashSessionsService.close("00000000-0000-0000-0000-000000000000", 100)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records a movement on an open session and blocks it on a closed one (409, nothing recorded)", async () => {
    const { id: openId } = await cashSessionsService.open({
      businessDate: "2099-03-01",
      openingAmount: 0,
      notes: ""
    });
    const movement = await cashSessionsService.recordMovement(openId, {
      type: "egreso",
      amount: 250,
      notes: "compra insumos"
    });
    expect(movement.entityId).toBe(openId);

    await cashSessionsService.close(openId, 0);
    await expect(
      cashSessionsService.recordMovement(openId, { type: "egreso", amount: 10 })
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });

    const { rows } = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM audit_logs WHERE action = 'cash.movement' AND entity_id = $1",
      [openId]
    );
    expect(Number(rows[0].n)).toBe(1); // only the successful one
  });

  it("lists sessions and returns 404 when no session is open", async () => {
    await cashSessionsService.open({ businessDate: "2099-04-01", openingAmount: 100, notes: "" });
    const sessions = await cashSessionsService.list();
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    // All sessions closed -> no current session.
    for (const session of sessions) {
      if (session.status === "open") {
        await cashSessionsService.close(session.id, session.openingAmount);
      }
    }
    expect(await cashSessionsService.current()).toBeNull();
  });
});

describePg("stock-movements service", () => {
  it("records unit in/out movements and lists them filtered by product and date", async () => {
    const a = await seedProduct("gsvc-mov-a", 0, 100);
    const b = await seedProduct("gsvc-mov-b", 0, 100);

    const entrada = await stockMovementsService.record({
      productId: a,
      movementType: "entrada",
      quantity: 5,
      detail: "compra"
    });
    expect(entrada.productId).toBe(a);
    expect(entrada.movementType).toBe("entrada");
    expect(entrada.quantity).toBe(5);

    await stockMovementsService.record({ productId: b, movementType: "entrada", quantity: 2 });
    await stockMovementsService.record({
      productId: a,
      movementType: "salida",
      quantity: 1,
      detail: "venta"
    });

    const forA = await stockMovementsService.list({ productId: a });
    expect(forA).toHaveLength(2);
    expect(forA.map((m) => m.movementType)).toEqual(["salida", "entrada"]); // newest first

    const forMissing = await stockMovementsService.list({ productId: "irrelevante" });
    expect(forMissing).toEqual([]);

    const fromToday = await stockMovementsService.list({ from: TODAY });
    expect(fromToday.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects movements for an unknown product with 404", async () => {
    await expect(
      stockMovementsService.record({ productId: "no-existe", movementType: "entrada", quantity: 1 })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describePg("crud services (clients, categories, services, purchases)", () => {
  it("clients: create with role cliente, list, getById; duplicate email -> 409 conflict", async () => {
    const client = await clientsService.create({
      name: "Cliente Crud",
      email: "crud-cli@test.uy",
      phone: "099111222"
    });
    expect(client.isApproved).toBe(false);

    const listed = await clientsService.list({ active: "all" });
    expect(listed.some((c) => c.id === client.id)).toBe(true);

    const byId = await clientsService.getById(client.id);
    expect(byId?.name).toBe("Cliente Crud");
    expect(byId?.email).toBe("crud-cli@test.uy");

    await expect(
      clientsService.create({ name: "Duplicado", email: "crud-cli@test.uy" })
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(await clientsService.getById("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("categories: list includes seeded rows, create + getById, duplicate id -> 409", async () => {
    const listed = await categoriesService.list();
    expect(listed.length).toBeGreaterThanOrEqual(7);
    expect(listed.some((c) => c.id === "celulares")).toBe(true);

    const created = await categoriesService.create({ id: "crud-cat-1", name: "Prueba", code: "PRB" });
    expect(created.id).toBe("crud-cat-1");

    const byId = await categoriesService.getById("crud-cat-1");
    expect(byId?.name).toBe("Prueba");

    await expect(
      categoriesService.create({ id: "crud-cat-1", name: "Otro", code: "OTR" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("services: create with payload passthrough and list", async () => {
    const service = await servicesService.create({ name: "Diagnóstico", data: { durationMin: 30 } });
    expect(service.name).toBe("Diagnóstico");

    const listed = await servicesService.list();
    expect(listed.some((s) => s.id === service.id && s.name === "Diagnóstico")).toBe(true);
  });

  it("purchases: create with supplierName + payload passthrough and list", async () => {
    const purchase = await purchasesService.create({
      supplierName: "Proveedor Crud",
      data: { invoice: "A-123", total: 5000 }
    });
    expect(purchase.supplierName).toBe("Proveedor Crud");

    const listed = await purchasesService.list();
    expect(listed.some((p) => p.id === purchase.id && p.supplierName === "Proveedor Crud")).toBe(true);
  });
});