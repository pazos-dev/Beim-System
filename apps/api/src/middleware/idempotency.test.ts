/**
 * Idempotency middleware tests (issue #88) — POST creates with Idempotency-Key.
 *
 * Covers the three wired routes (sales-batch, orders, checkout-sessions):
 * same key + payload replays the stored response without re-executing,
 * different keys execute, invalid keys and payload mismatches are 422,
 * in-flight keys are 409 (implicit), expired keys re-execute, and requests
 * without a key keep the current behavior. Runs against beim_api_test
 * (see src/db/testDb.ts).
 */
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../db/testDb.js";

// Point the shared Pool at the test database: this suite issues queries, and
// config/db.ts builds the Pool from DATABASE_URL at module evaluation time
// (same pattern as repair-shop.test.ts). setupTestDatabase() re-asserts it.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";
process.env.CHECKOUT_BASE_URL ??= "https://checkout.beim.test";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top.
const { createApp } = await import("../app.js");
const { query } = await import("../config/db.js");
const { hashPassword } = await import("../modules/webshop/services/auth.js");

const OPERATOR = ["vendedor"];
const GESTION_USER_ID = "u-taller-idem";

/** Gestion app with an injected operator identity (tests stand in for auth). */
function appWithGestion(): Express {
  return createApp({
    resolveIdentity: () => ({ userId: GESTION_USER_ID, roles: OPERATOR })
  });
}

/** Real webshop app: Bearer sessions resolved against the test database. */
function appWebshop(): Express {
  return createApp();
}

async function seedProduct(id: string, stock: number, price = 1120): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description)
     VALUES ($1, 'Taller idempotencia', 'celulares', '', '', $3, 'UYU', $2, 'Nuevo', '')
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price, updated_at = now()`,
    [id, stock, price]
  );
  return id;
}

async function seedWebProduct(price = 250, stock = 6): Promise<string> {
  const id = randomUUID();
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published)
     VALUES ($1::uuid, 'Repuesto taller', 'celulares', '', '', $2, 'UYU', $3, 'Nuevo', '', true)
     ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock,
       published = true, updated_at = now()`,
    [id, price, stock]
  );
  return id;
}

async function seedUser(overrides: { name?: string; email?: string } = {}) {
  const id = randomUUID();
  const name = overrides.name ?? "Taller Camila";
  const email = overrides.email ?? `taller-${id.slice(0, 8)}@beim.test`;
  const passwordHash = await hashPassword("Secreto-123!");
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1::uuid, $2, $2::text || '-' || $1::text, $3, $4, 'cliente', true)
     ON CONFLICT (id) DO NOTHING`,
    [id, name, email, passwordHash]
  );
  return { id, email };
}

async function login(app: Express, email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier: email, password: "Secreto-123!" });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

function salesPayload(clientName: string, quantity = 1) {
  return {
    clientName,
    clientId: `taller-idem-${randomUUID().slice(0, 8)}`,
    clientPhone: "+598 99 111 222",
    deviceModel: "Galaxy A54",
    reportedIssue: "Pantalla rota",
    items: [{ productId: "cargador-rapido", quantity }],
    payments: [{ method: "efectivo", amount: 1120 * quantity }]
  };
}

describePg("idempotency: sales-batch", () => {
  it("misma key reintenta sin duplicar: 201 ambas, mismo recibo, marca de replay y un solo recibo", async () => {
    await seedProduct("cargador-rapido", 30, 1120);
    const app = appWithGestion();
    const key = randomUUID();
    const payload = salesPayload("Idem Taller Uno");

    const first = await request(app).post("/api/v1/sales-batch").set("Idempotency-Key", key).send(payload);
    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    const receiptId = first.body.data.receipt.id as string;

    const second = await request(app).post("/api/v1/sales-batch").set("Idempotency-Key", key).send(payload);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data.receipt.id).toBe(receiptId);
    expect(second.body).toEqual(first.body);

    const list = await request(app).get("/api/v1/receipts").query({ client: "Idem Taller Uno" });
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items.map((r: { id: string }) => r.id)).toEqual([receiptId]);
  });

  it("keys distintas generan dos recibos", async () => {
    await seedProduct("cargador-rapido", 30, 1120);
    const app = appWithGestion();
    const payload = salesPayload("Idem Taller Dos");

    const first = await request(app).post("/api/v1/sales-batch").set("Idempotency-Key", randomUUID()).send(payload);
    const second = await request(app)
      .post("/api/v1/sales-batch")
      .set("Idempotency-Key", randomUUID())
      .send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.receipt.id).not.toBe(first.body.data.receipt.id);

    const list = await request(app).get("/api/v1/receipts").query({ client: "Idem Taller Dos" });
    expect(list.body.data.total).toBe(2);
  });

  it("key inválida (no-uuid) responde 422", async () => {
    await seedProduct("cargador-rapido", 30, 1120);
    const app = appWithGestion();
    const res = await request(app)
      .post("/api/v1/sales-batch")
      .set("Idempotency-Key", "no-es-uuid")
      .send(salesPayload("Idem Taller Tres"));
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("misma key con cuerpo distinto (cantidad 2) responde 422", async () => {
    await seedProduct("cargador-rapido", 30, 1120);
    const app = appWithGestion();
    const key = randomUUID();

    const first = await request(app)
      .post("/api/v1/sales-batch")
      .set("Idempotency-Key", key)
      .send(salesPayload("Idem Taller Cuatro", 1));
    expect(first.status).toBe(201);

    const mismatch = await request(app)
      .post("/api/v1/sales-batch")
      .set("Idempotency-Key", key)
      .send(salesPayload("Idem Taller Cuatro", 2));
    expect(mismatch.status).toBe(422);
    expect(mismatch.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("key expirada (backdate por SQL) re-ejecuta y crea un recurso nuevo", async () => {
    await seedProduct("cargador-rapido", 30, 1120);
    const app = appWithGestion();
    const key = randomUUID();
    const payload = salesPayload("Idem Taller Cinco");

    const first = await request(app).post("/api/v1/sales-batch").set("Idempotency-Key", key).send(payload);
    expect(first.status).toBe(201);

    await query(
      "UPDATE idempotency_keys SET expires_at = now() - interval '1 hour' WHERE key = $1 AND scope = 'sales-batch'",
      [key]
    );

    const second = await request(app).post("/api/v1/sales-batch").set("Idempotency-Key", key).send(payload);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBeUndefined();
    expect(second.body.data.receipt.id).not.toBe(first.body.data.receipt.id);

    const list = await request(app).get("/api/v1/receipts").query({ client: "Idem Taller Cinco" });
    expect(list.body.data.total).toBe(2);
  });

  it("sin header ejecuta normal: 201 sin marca de replay y sin deduplicar", async () => {
    await seedProduct("cargador-rapido", 30, 1120);
    const app = appWithGestion();
    const payload = salesPayload("Idem Taller Seis");

    const first = await request(app).post("/api/v1/sales-batch").send(payload);
    const second = await request(app).post("/api/v1/sales-batch").send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    expect(second.headers["idempotent-replayed"]).toBeUndefined();
    expect(second.body.data.receipt.id).not.toBe(first.body.data.receipt.id);
  });
});

describePg("idempotency: webshop orders + checkout", () => {
  it("órdenes: misma key reintenta sin duplicar (mismo id, una sola orden)", async () => {
    const app = appWebshop();
    const productId = await seedWebProduct();
    const user = await seedUser({ name: "Taller Diego" });
    const token = await login(app, user.email);
    const key = randomUUID();
    const payload = { customer: "Diego Mostrador", items: [{ productId, quantity: 1 }] };

    const first = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();
    const orderId = first.body.data.order.id as string;

    const second = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send(payload);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data.order.id).toBe(orderId);
    expect(second.body).toEqual(first.body);

    const list = await request(app).get("/api/v1/orders").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items.map((o: { id: string }) => o.id)).toEqual([orderId]);
  });

  it("checkout: misma key reintenta sin mintear otra sesión (mismo id)", async () => {
    const app = appWebshop();
    const productId = await seedWebProduct();
    const user = await seedUser({ name: "Taller Lucía" });
    const token = await login(app, user.email);

    const order = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ customer: "Lucía Caja", items: [{ productId, quantity: 1 }] });
    expect(order.status).toBe(201);
    const orderId = order.body.data.order.id as string;

    const key = randomUUID();
    const first = await request(app)
      .post("/api/v1/checkout-sessions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ orderId });
    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();

    const second = await request(app)
      .post("/api/v1/checkout-sessions")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ orderId });
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body).toEqual(first.body);
  });
});
