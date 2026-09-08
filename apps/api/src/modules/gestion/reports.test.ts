/**
 * Reports tests (issue #164) — cell-phone workshop domain.
 *
 * Plants aggregates through the REAL flows (sales-batch via service,
 * receipts via HTTP, webshop orders via service, cash open/movement/close)
 * and asserts the five GET /reports/* endpoints match the listings. Runs
 * against beim_api_test (see src/db/testDb.ts).
 */
import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Point the shared Pool at the test database (same pattern as
// repair-shop.test.ts): config/db.ts builds the Pool from DATABASE_URL at
// module evaluation time.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top.
const { createApp } = await import("../../app.js");
const { query } = await import("../../config/db.js");
const { salesBatchService } = await import("./services/sales-batch.js");
const { receiptsService } = await import("./services/receipts.js");
const { cashSessionsService } = await import("./services/cash-sessions.js");
const { ordersService } = await import("../webshop/services/orders.js");
const { hashPassword } = await import("../webshop/services/auth.js");

interface TestIdentityOptions {
  roles?: string[] | null;
}

/** createApp with an injected identity (tests stand in for the auth module). */
function appWith({ roles }: TestIdentityOptions = {}): Express {
  return createApp({
    resolveIdentity:
      roles === undefined || roles === null ? undefined : () => ({ userId: "u-test", roles })
  });
}

const OPERATOR = ["vendedor"];

async function seedProduct(
  id: string,
  stock: number,
  price = 100,
  overrides: { published?: boolean; minStock?: number } = {}
): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published, min_stock)
     VALUES ($1, 'Reportes seed', 'celulares', '', '', $3, 'UYU', $2, 'Nuevo', '', $4, $5)
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price,
       published = EXCLUDED.published, min_stock = EXCLUDED.min_stock, updated_at = now()`,
    [id, stock, price, overrides.published ?? true, overrides.minStock ?? 0]
  );
  return id;
}

async function seedWebUser(): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1::uuid, 'Usuario Reportes', $2, $3, $4, 'cliente', true)`,
    [id, `ur-${id.slice(0, 8)}`, `reportes-${id.slice(0, 8)}@beim.test`, await hashPassword("Secreto-123!")]
  );
  return id;
}

/** Midday UTC timestamps keep created_at::date stable across timezones. */
async function backdateReceipt(id: string, date: string): Promise<void> {
  await query("UPDATE beim_receipts SET created_at = $2::timestamptz WHERE id = $1", [
    id,
    `${date}T12:00:00Z`
  ]);
  await query("UPDATE gestion_payment_movements SET business_date = $2::date WHERE receipt_id = $1", [
    id,
    date
  ]);
}

async function backdateOrder(id: string, date: string): Promise<void> {
  await query("UPDATE orders SET created_at = $2::timestamptz WHERE id = $1", [id, `${date}T12:00:00Z`]);
}

async function backdateCashMovements(sessionId: string, date: string): Promise<void> {
  await query(
    `UPDATE audit_logs SET created_at = $2::timestamptz
     WHERE action = 'cash.movement' AND entity_id = $1`,
    [sessionId, `${date}T12:00:00Z`]
  );
}

describePg("reports: sales-summary", () => {
  it("aggregates a counter sale planted via sales-batch (matches the receipts list)", async () => {
    const a = await seedProduct("rep-sale-a", 10, 100);
    const b = await seedProduct("rep-sale-b", 10, 200);
    const sale = await salesBatchService.run({
      clientName: "Martín Reportes",
      clientId: "rep-cli-1",
      items: [
        { productId: a, quantity: 2 },
        { productId: b, quantity: 1 }
      ],
      payments: [{ method: "Efectivo", amount: 400 }]
    });
    await backdateReceipt(sale.receipt.id, "2026-03-10");

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/sales-summary")
      .query({ from: "2026-03-10", to: "2026-03-10" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      from: "2026-03-10",
      to: "2026-03-10",
      totalSales: 400,
      ticketCount: 1,
      averageTicket: 400
    });
    expect(res.body.data.byMethod).toMatchObject([{ method: "Efectivo", total: 400, count: 1 }]);

    // Same range through the receipts list shows the same ticket.
    const list = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/receipts")
      .query({ from: "2026-03-10", to: "2026-03-10" });
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].id).toBe(sale.receipt.id);
  });

  it("fills empty days with zero in the daily series", async () => {
    const a = await seedProduct("rep-series-a", 10, 150);
    const sale = await salesBatchService.run({
      clientName: "Lucía Serie",
      clientId: "rep-cli-2",
      items: [{ productId: a, quantity: 1 }],
      payments: [{ method: "Tarjeta", amount: 150 }]
    });
    await backdateReceipt(sale.receipt.id, "2026-03-12");

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/sales-summary")
      .query({ from: "2026-03-11", to: "2026-03-14" });
    expect(res.status).toBe(200);
    expect(res.body.data.byDay.map((d: { date: string }) => d.date)).toEqual([
      "2026-03-11",
      "2026-03-12",
      "2026-03-13",
      "2026-03-14"
    ]);
    expect(res.body.data.byDay).toMatchObject([
      { date: "2026-03-11", total: 0, count: 0 },
      { date: "2026-03-12", total: 150, count: 1 },
      { date: "2026-03-13", total: 0, count: 0 },
      { date: "2026-03-14", total: 0, count: 0 }
    ]);
  });

  it("excludes annulled receipts from totals (movements net to zero)", async () => {
    const a = await seedProduct("rep-annul-a", 10, 300);
    const sale = await salesBatchService.run({
      clientName: "Anulado Reportes",
      clientId: "rep-cli-3",
      items: [{ productId: a, quantity: 1 }],
      payments: [{ method: "Efectivo", amount: 300 }]
    });
    await receiptsService.annul(sale.receipt.id);
    await backdateReceipt(sale.receipt.id, "2026-03-20");

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/sales-summary")
      .query({ from: "2026-03-20", to: "2026-03-20" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalSales: 0, ticketCount: 0, averageTicket: 0 });
    // Original + reversal net out under the same method.
    expect(res.body.data.byMethod).toMatchObject([{ method: "Efectivo", total: 0, count: 2 }]);
  });

  it("rejects from>to with 422", async () => {
    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/sales-summary")
      .query({ from: "2026-03-15", to: "2026-03-10" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects ranges over 366 days with 422", async () => {
    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/cash-summary")
      .query({ from: "2024-01-01", to: "2026-03-10" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describePg("reports: stock-valuation", () => {
  it("values stock x price per product with low-stock flags and grand total", async () => {
    await seedProduct("rep-stock-a", 4, 100, { minStock: 5 });
    await seedProduct("rep-stock-b", 10, 50, { minStock: 2 });

    const res = await request(appWith({ roles: OPERATOR })).get("/api/v1/reports/stock-valuation");
    expect(res.status).toBe(200);
    const items = res.body.data.items as Array<{
      productId: string;
      valuation: number;
      lowStock: boolean;
    }>;
    const byId = new Map(items.map((item) => [item.productId, item]));
    expect(byId.get("rep-stock-a")).toMatchObject({ valuation: 400, lowStock: true });
    expect(byId.get("rep-stock-b")).toMatchObject({ valuation: 500, lowStock: false });
    // Grand total covers every product planted so far in this file.
    const expected = items.reduce((sum, item) => sum + item.valuation, 0);
    expect(res.body.data.totalValuation).toBe(expected);
    expect(res.body.data.lowStockCount).toBeGreaterThanOrEqual(1);
  });
});

describePg("reports: cash-summary", () => {
  it("nets movements by type and lists the closed session with its difference", async () => {
    const opened = await cashSessionsService.open({
      businessDate: "2026-04-01",
      openingAmount: 500,
      notes: "reportes"
    });
    await cashSessionsService.recordMovement(opened.id, { type: "ingreso", amount: 1000 });
    await cashSessionsService.recordMovement(opened.id, { type: "egreso", amount: 200 });
    await backdateCashMovements(opened.id, "2026-04-01");
    // Journaled movements never touch expected_amount (500): counted 1300 → +800.
    await cashSessionsService.close(opened.id, 1300);

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/cash-summary")
      .query({ from: "2026-04-01", to: "2026-04-01" });
    expect(res.status).toBe(200);
    expect(res.body.data.movements).toMatchObject([
      { type: "egreso", total: 200, count: 1 },
      { type: "ingreso", total: 1000, count: 1 }
    ]);
    expect(res.body.data.net).toBe(800);
    expect(res.body.data.closedCount).toBe(1);
    expect(res.body.data.totalDifference).toBe(800);
    expect(res.body.data.sessions[0]).toMatchObject({
      businessDate: "2026-04-01",
      openingAmount: 500,
      expectedAmount: 500,
      countedAmount: 1300,
      difference: 800
    });
  });
});

describePg("reports: top-products", () => {
  it("combines counter sales and webshop orders, ordered by quantity and revenue", async () => {
    const a = await seedProduct("rep-top-a", 20, 100);
    const b = await seedProduct("rep-top-b", 20, 50);
    const sale = await salesBatchService.run({
      clientName: "Top Mostrador",
      clientId: "rep-cli-4",
      items: [{ productId: a, quantity: 2 }],
      payments: [{ method: "Efectivo", amount: 200 }]
    });
    await backdateReceipt(sale.receipt.id, "2026-05-10");
    const userId = await seedWebUser();
    const order = await ordersService.create(userId, {
      customer: "Comprador Top",
      items: [
        { productId: a, quantity: 1 },
        { productId: b, quantity: 3 }
      ]
    });
    await backdateOrder(order.order.id, "2026-05-10");

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/top-products")
      .query({ from: "2026-05-10", to: "2026-05-10" });
    expect(res.status).toBe(200);
    // A: 2 (counter) + 1 (webshop) = 3 units, 300 revenue — first on both lists.
    expect(res.body.data.byQuantity[0]).toMatchObject({
      productId: "rep-top-a",
      quantity: 3,
      revenue: 300
    });
    expect(res.body.data.byQuantity[1]).toMatchObject({
      productId: "rep-top-b",
      quantity: 3,
      revenue: 150
    });
    expect(res.body.data.byRevenue[0].productId).toBe("rep-top-a");
    expect(res.body.data.byRevenue[1].productId).toBe("rep-top-b");
  });

  it("breaks quantity ties by revenue, then product id", async () => {
    const t1 = await seedProduct("rep-tie-a", 20, 10);
    const t2 = await seedProduct("rep-tie-b", 20, 30);
    const sale = await salesBatchService.run({
      clientName: "Top Empate",
      clientId: "rep-cli-5",
      items: [
        { productId: t1, quantity: 2 },
        { productId: t2, quantity: 2 }
      ],
      payments: [{ method: "Efectivo", amount: 80 }]
    });
    await backdateReceipt(sale.receipt.id, "2026-05-11");

    const res = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/top-products")
      .query({ from: "2026-05-11", to: "2026-05-11" });
    expect(res.status).toBe(200);
    // Same quantity (2): higher revenue first.
    expect(res.body.data.byQuantity.map((r: { productId: string }) => r.productId)).toEqual([
      "rep-tie-b",
      "rep-tie-a"
    ]);
  });

  it("clamps limit (101 -> 422) and honors small limits", async () => {
    const tooBig = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/top-products")
      .query({ limit: 101 });
    expect(tooBig.status).toBe(422);

    const one = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/reports/top-products")
      .query({ from: "2026-05-10", to: "2026-05-10", limit: 1 });
    expect(one.status).toBe(200);
    expect(one.body.data.limit).toBe(1);
    expect(one.body.data.byQuantity).toHaveLength(1);
    expect(one.body.data.byRevenue).toHaveLength(1);
  });
});

describePg("reports: repairs-by-status", () => {
  it("counts tickets per machine state", async () => {
    const before = (
      await request(appWith({ roles: OPERATOR })).get("/api/v1/reports/repairs-by-status")
    ).body.data.counts as Record<string, number>;

    const stays = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/receipts")
      .send({ clientName: "Taller Ingresado" });
    expect(stays.status).toBe(201);
    const moves = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/receipts")
      .send({ clientName: "Taller Repara" });
    expect(moves.status).toBe(201);
    const moved = await request(appWith({ roles: OPERATOR }))
      .post(`/api/v1/receipts/${moves.body.data.id as string}/status`)
      .send({ status: "En reparación" });
    expect(moved.status).toBe(200);

    const prod = await seedProduct("rep-status-a", 10, 100);
    await salesBatchService.run({
      clientName: "Taller Entregado",
      clientId: "rep-cli-6",
      items: [{ productId: prod, quantity: 1 }],
      payments: [{ method: "Efectivo", amount: 100 }]
    });

    const doomed = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/receipts")
      .send({ clientName: "Taller Anulado" });
    const annulled = await request(appWith({ roles: OPERATOR })).post(
      `/api/v1/receipts/${doomed.body.data.id as string}/annul`
    );
    expect(annulled.status).toBe(200);

    const after = await request(appWith({ roles: OPERATOR })).get("/api/v1/reports/repairs-by-status");
    expect(after.status).toBe(200);
    const counts = after.body.data.counts as Record<string, number>;
    expect(counts["Ingresado"] - before["Ingresado"]).toBe(1);
    expect(counts["En reparación"] - before["En reparación"]).toBe(1);
    expect(counts["Entregado"] - before["Entregado"]).toBe(1);
    expect(counts["Cancelado"] - before["Cancelado"]).toBe(1);
    expect(after.body.data.total).toBe(
      Object.values(counts).reduce((sum, count) => sum + count, 0)
    );
  });
});

describePg("reports: auth matrix", () => {
  const paths = [
    "/api/v1/reports/sales-summary",
    "/api/v1/reports/stock-valuation",
    "/api/v1/reports/cash-summary",
    "/api/v1/reports/top-products",
    "/api/v1/reports/repairs-by-status"
  ];

  it("operator reads all five (200 with envelope)", async () => {
    for (const path of paths) {
      const res = await request(appWith({ roles: OPERATOR })).get(path);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    }
  });

  it("cliente role is forbidden (403) on all five", async () => {
    for (const path of paths) {
      const res = await request(appWith({ roles: ["cliente"] })).get(path);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
  });

  it("anonymous callers see 404 on all five", async () => {
    for (const path of paths) {
      const res = await request(appWith()).get(path);
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    }
  });
});
