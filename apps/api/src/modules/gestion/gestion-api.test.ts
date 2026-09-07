/**
 * HTTP-layer tests for the gestion module (PR 3) through createApp.
 *
 * Covers the spec scenarios end-to-end with the real envelope contracts
 * ({ ok, data } / { ok: false, error }), the NOT_FOUND_OR_FORBIDDEN auth
 * policy (no identity → 404, unmatched role → 403), field-level 422
 * validation, the singleton financial state, and the closed-session gate.
 * Runs against beim_api_test (see src/db/testDb.ts).
 */
import type { Express } from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top:
// createApp pulls in the router → services → config/db, which builds the
// shared Pool from DATABASE_URL at module evaluation time.
const { createApp } = await import("../../app.js");
const { query } = await import("../../config/db.js");

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
const ADMIN = ["administrador"];

async function seedProduct(id: string, stock: number, price = 100): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description)
     VALUES ($1, 'Api seed', 'celulares', '', '', $3, 'UYU', $2, 'Nuevo', '')
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price, updated_at = now()`,
    [id, stock, price]
  );
  return id;
}

async function readStock(id: string): Promise<number> {
  const { rows } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [id]);
  return rows[0].stock;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await query<{ n: string }>(`SELECT count(*)::text AS n ${sql}`, params);
  return Number(rows[0].n);
}

describePg("routing + auth policy", () => {
  it("unknown route returns 404 NOT_FOUND_OR_FORBIDDEN envelope", async () => {
    const res = await request(appWith({ roles: OPERATOR })).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN" } });
  });

  it("caller WITHOUT identity sees 404 (never a hint the resource exists)", async () => {
    const res = await request(appWith()).post("/api/v1/receipts").send({ clientName: "Anonimo" });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it("viewer role is forbidden (403) from writing receipts and nothing is persisted", async () => {
    const res = await request(appWith({ roles: ["viewer"] }))
      .post("/api/v1/receipts")
      .send({ clientName: "Vista Prohibida" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await count("FROM beim_receipts WHERE client_name = $1", ["Vista Prohibida"])).toBe(0);
  });

  it("operator role is forbidden from admin-only routes (services create)", async () => {
    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/services")
      .send({ name: "No permitido" });
    expect(res.status).toBe(403);
  });
});

describePg("receipts + sales-batch (spec scenarios 1–4)", () => {
  it("scenario 1 — valid receipt creation returns 201 with ok:true", async () => {
    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/receipts")
      .send({ clientName: "Cliente Api", clientId: "api-cli-1", price: "500" });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.receiptNumber).toBeGreaterThanOrEqual(1000);
    expect(res.body.data.repairStatus).toBe("Ingresado");
  });

  it("scenario 2 — invalid batch body is rejected with 422 and no state change", async () => {
    const a = await seedProduct("http-invalid-a", 5);
    const before = await readStock(a);

    const missingDocument = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({ items: [{ productId: a, quantity: 1 }] });
    expect(missingDocument.status).toBe(422);
    expect(missingDocument.body.ok).toBe(false);
    expect(missingDocument.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(missingDocument.body.error.details)).toBe(true);

    // Client-supplied pricing is not accepted (server-authoritative prices).
    const clientPrice = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({
        clientName: "No Precio",
        clientId: "api-cli-2",
        items: [{ productId: a, quantity: 1, unitPrice: 1 }]
      });
    expect(clientPrice.status).toBe(422);

    const negativeQty = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({ clientName: "Negativo", clientId: "api-cli-3", items: [{ productId: a, quantity: -1 }] });
    expect(negativeQty.status).toBe(422);

    const emptyItems = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({ clientName: "Vacio", clientId: "api-cli-4", items: [] });
    expect(emptyItems.status).toBe(422);

    expect(await readStock(a)).toBe(before);
    expect(await count("FROM beim_receipts")).toBe(1); // only scenario-1 receipt
  });

  it("scenario 3 — batch sale decrements atomically, persists parts + one payment movement", async () => {
    const a = await seedProduct("http-batch-a", 5, 100);
    const b = await seedProduct("http-batch-b", 3, 200);

    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({
        clientName: "Cliente Batch",
        clientId: "api-cli-5",
        items: [
          { productId: a, quantity: 2 },
          { productId: b, quantity: 1 }
        ],
        payments: [{ method: "Efectivo", amount: 400 }]
      });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(400);
    expect(res.body.data.receipt.repairStatus).toBe("Entregado");
    expect(res.body.data.items).toEqual([
      { productId: a, quantity: 2, unitPrice: 100 },
      { productId: b, quantity: 1, unitPrice: 200 }
    ]);

    expect(await readStock(a)).toBe(3);
    expect(await readStock(b)).toBe(2);
    expect(
      await count("FROM beim_receipt_parts WHERE receipt_id = $1 AND stock_decremented", [
        res.body.data.receipt.id
      ])
    ).toBe(2);
    expect(
      await count("FROM gestion_payment_movements WHERE receipt_id = $1 AND amount = 400", [
        res.body.data.receipt.id
      ])
    ).toBe(1);
  });

  it("scenario 4 — insufficient stock aborts with 409, reports current stock, persists nothing", async () => {
    const a = await seedProduct("http-low-a", 1);
    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({ clientName: "Sin Stock", clientId: "api-cli-6", items: [{ productId: a, quantity: 5 }] });

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK", details: { currentStock: 1 } });
    expect(await readStock(a)).toBe(1);
    expect(await count("FROM beim_receipts WHERE client_id = $1", ["api-cli-6"])).toBe(0);
  });

  it("next-number previews without advancing; list filters by client and payment method", async () => {
    const preview = await request(appWith({ roles: OPERATOR })).get("/api/v1/receipts/next-number");
    expect(preview.status).toBe(200);
    expect(preview.body.data.receiptNumber).toBeGreaterThanOrEqual(1000);

    const a = await seedProduct("http-list-a", 10, 100);
    await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({
        clientName: "Filtrable Http",
        clientId: "api-cli-7",
        items: [{ productId: a, quantity: 1 }],
        payments: [{ method: "Efectivo", amount: 100 }]
      });
    await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({
        clientName: "Otra Venta",
        clientId: "api-cli-8",
        items: [{ productId: a, quantity: 1 }],
        payments: [{ method: "Tarjeta", amount: 100 }]
      });

    const byClient = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/receipts")
      .query({ client: "filtrable http" });
    expect(byClient.status).toBe(200);
    expect(byClient.body.data.total).toBe(1);
    expect(byClient.body.data.items[0].clientName).toBe("Filtrable Http");

    const byMethod = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/receipts")
      .query({ paymentMethod: "Tarjeta" });
    expect(byMethod.body.data.total).toBe(1);
    expect(byMethod.body.data.items[0].clientName).toBe("Otra Venta");

    const noMatch = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/receipts")
      .query({ paymentMethod: "Cheque" });
    expect(noMatch.body.data.total).toBe(0);
    expect(noMatch.body.data.items).toEqual([]);
  });

  it("getById returns the receipt; unknown -> 404; malformed uuid -> 422", async () => {
    const a = await seedProduct("http-get-a", 2);
    const created = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({ clientName: "Por Id", clientId: "api-cli-9", items: [{ productId: a, quantity: 1 }] });
    const id: string = created.body.data.receipt.id;

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/receipts/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.id).toBe(id);

    const unknown = await request(appWith({ roles: OPERATOR })).get(
      "/api/v1/receipts/00000000-0000-0000-0000-000000000000"
    );
    expect(unknown.status).toBe(404);

    const malformed = await request(appWith({ roles: OPERATOR })).get("/api/v1/receipts/not-a-uuid");
    expect(malformed.status).toBe(422);
  });
});

describePg("annul (spec scenario 5)", () => {
  it("restores stock, marks Cancelado / Sin abonar, reverses movements; double annul -> 409", async () => {
    const a = await seedProduct("http-annul-a", 5, 100);
    const sale = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({
        clientName: "Para Anular Http",
        clientId: "api-cli-10",
        items: [{ productId: a, quantity: 2 }],
        payments: [{ method: "Efectivo", amount: 200 }]
      });
    const id: string = sale.body.data.receipt.id;
    expect(await readStock(a)).toBe(3);

    const annul = await request(appWith({ roles: OPERATOR })).post(`/api/v1/receipts/${id}/annul`);
    expect(annul.status).toBe(200);
    expect(annul.body.ok).toBe(true);
    expect(annul.body.data.receipt.repairStatus).toBe("Cancelado");
    expect(annul.body.data.receipt.paymentStatus).toBe("Sin abonar");
    expect(annul.body.data.receipt.price).toBe("0");
    expect(annul.body.data.restoredItems).toEqual([{ productId: a, quantity: 2 }]);
    expect(annul.body.data.reversedMovements).toBe(1);
    expect(await readStock(a)).toBe(5);

    const { rows } = await query<{ amount: string }>(
      "SELECT amount FROM gestion_payment_movements WHERE receipt_id = $1 ORDER BY id",
      [id]
    );
    expect(rows.map((r) => Number(r.amount)).reduce((x, y) => x + y, 0)).toBe(0);

    const again = await request(appWith({ roles: OPERATOR })).post(`/api/v1/receipts/${id}/annul`);
    expect(again.status).toBe(409);
    expect(await readStock(a)).toBe(5); // no double restore
  });
});

describePg("financial-state (spec scenario 6)", () => {
  it("upserts the singleton (singleton_id=1), merges partial updates, echoes on GET", async () => {
    const put = await request(appWith({ roles: OPERATOR }))
      .put("/api/v1/financial-state")
      .send({ capitalInitial: 5000, preferences: { theme: "dark" } });
    expect(put.status).toBe(200);
    expect(put.body.data.singletonId).toBe(1);
    expect(put.body.data.capitalInitial).toBe(5000);

    const merged = await request(appWith({ roles: OPERATOR }))
      .put("/api/v1/financial-state")
      .send({ expenses: [{ name: "Luz", amount: 1200 }] });
    expect(merged.body.data.capitalInitial).toBe(5000); // preserved by merge
    expect(merged.body.data.expenses).toEqual([{ name: "Luz", amount: 1200 }]);

    const get = await request(appWith({ roles: OPERATOR })).get("/api/v1/financial-state");
    expect(get.status).toBe(200);
    expect(get.body.data.capitalInitial).toBe(5000);

    expect(await count("FROM gestion_financial_state")).toBe(1);
  });

  it("rejects negative capitalInitial and negative opening balances with 422", async () => {
    const negative = await request(appWith({ roles: OPERATOR }))
      .put("/api/v1/financial-state")
      .send({ capitalInitial: -10 });
    expect(negative.status).toBe(422);

    const balances = await request(appWith({ roles: OPERATOR }))
      .put("/api/v1/financial-state")
      .send({ accountingState: { openingBalances: { cash: 100, bank: -20 } } });
    expect(balances.status).toBe(422);
  });
});

describePg("cash-sessions (spec scenario 7)", () => {
  it("open -> list -> current -> movement -> close; closed sessions block movements (409)", async () => {
    const open = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/cash-sessions")
      .send({ businessDate: "2099-11-01", openingAmount: 500, notes: "apertura" });
    expect(open.status).toBe(201);
    expect(open.body.data.status).toBe("open");
    expect(open.body.data.expectedAmount).toBe(500);
    const sessionId: string = open.body.data.id;

    const doubleOpen = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/cash-sessions")
      .send({ businessDate: "2099-11-02", openingAmount: 100 });
    expect(doubleOpen.status).toBe(409);

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/cash-sessions");
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);

    const current = await request(appWith({ roles: OPERATOR })).get("/api/v1/cash-sessions/current");
    expect(current.status).toBe(200);
    expect(current.body.data.id).toBe(sessionId);

    const movement = await request(appWith({ roles: OPERATOR }))
      .post(`/api/v1/cash-sessions/${sessionId}/movements`)
      .send({ type: "egreso", amount: 100, notes: "insumos" });
    expect(movement.status).toBe(201);

    const close = await request(appWith({ roles: OPERATOR }))
      .post(`/api/v1/cash-sessions/${sessionId}/close`)
      .send({ countedAmount: 350 });
    expect(close.status).toBe(200);
    expect(close.body.data.status).toBe("closed");
    expect(close.body.data.difference).toBe(-150); // 350 - 500

    const closeAgain = await request(appWith({ roles: OPERATOR }))
      .post(`/api/v1/cash-sessions/${sessionId}/close`)
      .send({ countedAmount: 350 });
    expect(closeAgain.status).toBe(409);

    const currentAfter = await request(appWith({ roles: OPERATOR })).get(
      "/api/v1/cash-sessions/current"
    );
    expect(currentAfter.status).toBe(404);

    const blocked = await request(appWith({ roles: OPERATOR }))
      .post(`/api/v1/cash-sessions/${sessionId}/movements`)
      .send({ type: "egreso", amount: 10 });
    expect(blocked.status).toBe(409);
    expect(
      await count("FROM audit_logs WHERE action = 'cash.movement' AND entity_id = $1", [sessionId])
    ).toBe(1); // only the open-session movement was recorded
  });

  it("invalid session body (bad date, negative amount) is rejected with 422", async () => {
    const badDate = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/cash-sessions")
      .send({ businessDate: "01/11/2099", openingAmount: 100 });
    expect(badDate.status).toBe(422);

    const negative = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/cash-sessions")
      .send({ businessDate: "2099-12-01", openingAmount: -5 });
    expect(negative.status).toBe(422);
  });
});

describePg("stock-movements", () => {
  it("records and lists unit in/out movements; unknown product -> 404; bad type -> 422", async () => {
    const a = await seedProduct("http-mov-a", 0);
    const recorded = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/stock-movements")
      .send({ productId: a, movementType: "entrada", quantity: 5, detail: "compra" });
    expect(recorded.status).toBe(201);
    expect(recorded.body.data.productId).toBe(a);
    expect(recorded.body.data.movementType).toBe("entrada");
    expect(recorded.body.data.quantity).toBe(5);

    const list = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/stock-movements")
      .query({ productId: a });
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const unknown = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/stock-movements")
      .send({ productId: "no-existe", movementType: "entrada", quantity: 1 });
    expect(unknown.status).toBe(404);

    const badType = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/stock-movements")
      .send({ productId: a, movementType: "transferencia", quantity: 1 });
    expect(badType.status).toBe(422);
  });
});

describePg("clients", () => {
  it("create (201) -> getById (200) -> list (200); duplicate email -> 409; bad uuid -> 422", async () => {
    const created = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/clients")
      .send({ name: "Cliente Api", email: "api-cli@test.uy", phone: "099000000" });
    expect(created.status).toBe(201);
    expect(created.body.data.isApproved).toBe(false);
    const id: string = created.body.data.id;

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/clients/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.name).toBe("Cliente Api");

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/clients").query({ active: "all" });
    expect(list.status).toBe(200);
    expect(list.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const duplicate = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/clients")
      .send({ name: "Duplicado", email: "api-cli@test.uy" });
    expect(duplicate.status).toBe(409);

    const malformed = await request(appWith({ roles: OPERATOR })).get("/api/v1/clients/not-a-uuid");
    expect(malformed.status).toBe(422);
  });
});

describePg("categories, services, purchases", () => {
  it("categories: list (seeded) for operators; create/getById for admins; duplicate id -> 409", async () => {
    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/categories");
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(7);
    expect(list.body.data.some((c: { id: string }) => c.id === "celulares")).toBe(true);

    const forbidden = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/categories")
      .send({ id: "http-cat-1", name: "Prueba", code: "PRB" });
    expect(forbidden.status).toBe(403);

    const created = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/categories")
      .send({ id: "http-cat-1", name: "Prueba", code: "PRB" });
    expect(created.status).toBe(201);

    const byId = await request(appWith({ roles: OPERATOR })).get("/api/v1/categories/http-cat-1");
    expect(byId.status).toBe(200);
    expect(byId.body.data.name).toBe("Prueba");

    const duplicate = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/categories")
      .send({ id: "http-cat-1", name: "Otro", code: "OTR" });
    expect(duplicate.status).toBe(409);
  });

  it("services: create (admin, 201) -> list (operator, 200)", async () => {
    const created = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/services")
      .send({ name: "Diagnóstico", data: { durationMin: 30 } });
    expect(created.status).toBe(201);

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/services");
    expect(list.status).toBe(200);
    expect(
      list.body.data.some(
        (s: { id: string; name: string }) => s.id === created.body.data.id && s.name === "Diagnóstico"
      )
    ).toBe(true);
  });

  it("purchases: create (admin, 201) -> list (operator, 200)", async () => {
    const created = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/purchases")
      .send({ supplierName: "Proveedor Api", data: { invoice: "B-1" } });
    expect(created.status).toBe(201);

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/purchases");
    expect(list.status).toBe(200);
    expect(
      list.body.data.some(
        (p: { id: string; supplierName: string }) =>
          p.id === created.body.data.id && p.supplierName === "Proveedor Api"
      )
    ).toBe(true);
  });
});