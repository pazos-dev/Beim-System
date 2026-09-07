/**
 * Order cancellation integration tests (issue #89) over HTTP + Postgres.
 *
 * The customer cancels their own pending order: the order flips to
 * status/payment_status 'Cancelado', pending checkout sessions are marked
 * 'cancelled', and the EXISTING gates (untouched) keep doing the right thing
 * — preferences 409, fresh checkout sessions 409, late approved webhooks
 * noop. No automatic refund (phase 2). Runs against beim_api_test (see
 * src/db/testDb.ts).
 */
import { createHmac, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Fake, inoffensive test values (never real credentials).
process.env.MP_ACCESS_TOKEN = "TEST-ACCESS-TOKEN";
process.env.MP_WEBHOOK_SECRET = "test-webhook-secret-abc123";
process.env.MP_NOTIFICATION_URL = "https://api.beim.test/api/v1/webhooks/mercadopago";
process.env.CHECKOUT_BASE_URL = "https://checkout.beim.test";
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

setupTestDatabase();

const { query } = await import("../../config/db.js");
const { hashPassword } = await import("./services/auth.js");
const { createApp } = await import("../../app.js");

const app = createApp();

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seedProduct(input: {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  stock: number;
  brand?: string;
  model?: string;
}): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published)
     VALUES ($1, $2, $3, $4, $5, $6, 'UYU', $7, 'Nuevo', '', true)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, price = EXCLUDED.price,
           stock = EXCLUDED.stock, brand = EXCLUDED.brand,
           model = EXCLUDED.model, published = EXCLUDED.published, updated_at = now()`,
    [input.id, input.name, input.categoryId, input.brand ?? "", input.model ?? "", input.price, input.stock]
  );
  return input.id;
}

async function seedUser(overrides: { id?: string; name?: string; email?: string } = {}) {
  const id = overrides.id ?? randomUUID();
  const name = overrides.name ?? "Comprador Taller";
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

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier: email, password: "Secreto-123!" });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

const CATEGORY_ID = "celulares";

async function seedWorkshopCatalog(): Promise<{ pantalla: string; bateria: string }> {
  const pantalla = await seedProduct({
    id: randomUUID(),
    name: "Pantalla iPhone 13",
    categoryId: CATEGORY_ID,
    brand: "Apple",
    model: "iPhone 13",
    price: 2800,
    stock: 5
  });
  const bateria = await seedProduct({
    id: randomUUID(),
    name: "Batería Galaxy A54",
    categoryId: CATEGORY_ID,
    brand: "Samsung",
    model: "Galaxy A54",
    price: 950,
    stock: 8
  });
  return { pantalla, bateria };
}

async function createOrder(token: string, productId: string, quantity: number): Promise<string> {
  const res = await request(app)
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({ customer: "Lucía Fernández", items: [{ productId, quantity }] });
  expect(res.status).toBe(201);
  return res.body.data.order.id as string;
}

interface OrderStatusRow {
  status: string;
  payment_status: string;
}

async function readOrderStatus(orderId: string): Promise<OrderStatusRow> {
  const { rows } = await query<OrderStatusRow>("SELECT status, payment_status FROM orders WHERE id = $1", [
    orderId
  ]);
  return rows[0];
}

function signHeaders(dataId: string, xRequestId?: string): Record<string, string> {
  const secret = process.env.MP_WEBHOOK_SECRET as string;
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  const headers: Record<string, string> = { "x-signature": `ts=${ts},v1=${v1}` };
  if (xRequestId !== undefined) headers["x-request-id"] = xRequestId;
  return headers;
}

describePg("order cancellation", () => {
  it("lets the owner cancel a pending order: 200 + status/payment_status Cancelado", async () => {
    const { pantalla } = await seedWorkshopCatalog();
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, pantalla, 1);

    const res = await request(app).post(`/api/v1/orders/${orderId}/cancel`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: { order: { id: orderId } } });
    expect(res.body.data.order.status).toBe("Cancelado");
    expect(res.body.data.order.paymentStatus).toBe("Cancelado");

    const row = await readOrderStatus(orderId);
    expect(row).toMatchObject({ status: "Cancelado", payment_status: "Cancelado" });
  });

  it("is idempotent: a second cancel answers 200 with the same cancelled order", async () => {
    const { bateria } = await seedWorkshopCatalog();
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, bateria, 2);

    const first = await request(app).post(`/api/v1/orders/${orderId}/cancel`).set("Authorization", `Bearer ${token}`);
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.data.order).toMatchObject({
      id: orderId,
      status: "Cancelado",
      paymentStatus: "Cancelado"
    });
  });

  it("answers 404 for another user's order (no existence leak)", async () => {
    const { pantalla } = await seedWorkshopCatalog();
    const owner = await seedUser();
    const stranger = await seedUser();
    const ownerToken = await login(owner.email);
    const strangerToken = await login(stranger.email);
    const orderId = await createOrder(ownerToken, pantalla, 1);

    const res = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN" } });

    // The order is untouched by the foreign attempt.
    expect(await readOrderStatus(orderId)).toMatchObject({ status: "Pendiente", payment_status: "Pendiente de pago" });
  });

  it("answers 401 without a token", async () => {
    const { pantalla } = await seedWorkshopCatalog();
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, pantalla, 1);

    const res = await request(app).post(`/api/v1/orders/${orderId}/cancel`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("answers 409 for a paid order and leaves it intact", async () => {
    const { pantalla } = await seedWorkshopCatalog();
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, pantalla, 1);
    // Deterministic stand-in for a webhook-paid order (no MP round-trip).
    await query("UPDATE orders SET payment_status = 'Pagado' WHERE id = $1", [orderId]);

    const res = await request(app).post(`/api/v1/orders/${orderId}/cancel`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await readOrderStatus(orderId)).toMatchObject({ status: "Pendiente", payment_status: "Pagado" });
  });

  it("invalidates a pending checkout session: SQL 'cancelled' + re-mint 409", async () => {
    const { bateria } = await seedWorkshopCatalog();
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, bateria, 1);

    const minted = await request(app)
      .post("/api/v1/checkout-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId });
    expect(minted.status).toBe(201);
    const sessionId = minted.body.data.id as string;

    const cancelled = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);

    const { rows } = await query<{ status: string }>("SELECT status FROM checkout_sessions WHERE id = $1", [
      sessionId
    ]);
    expect(rows[0].status).toBe("cancelled");

    // The existing checkout gate (untouched) rejects a fresh session: the
    // order is no longer pending payment.
    const retry = await request(app)
      .post("/api/v1/checkout-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId });
    expect(retry.status).toBe(409);
  });

  it("answers 409 when minting a payment preference for a cancelled order", async () => {
    const { pantalla } = await seedWorkshopCatalog();
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, pantalla, 1);

    const cancelled = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);

    // The existing preference gate (untouched) only serves pending orders.
    const res = await request(app)
      .post(`/api/v1/orders/${orderId}/payment-preference`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("noops a late approved webhook on a cancelled order and leaves it intact", async () => {
    const { bateria } = await seedWorkshopCatalog();
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, bateria, 1);

    const cancelled = await request(app)
      .post(`/api/v1/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);

    // Same stubbed-fetch + real-HMAC pattern as payments.test.ts.
    const dataId = "424242427";
    vi.stubGlobal("fetch", async (url: unknown) => {
      expect(String(url)).toBe(`https://api.mercadopago.com/v1/payments/${dataId}`);
      return { ok: true, json: async () => ({ id: 424242427, status: "approved", external_reference: orderId }) };
    });
    const notificationId = `evt-${randomUUID()}`;
    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId))
      .send({
        id: notificationId,
        live_mode: true,
        type: "payment",
        action: "payment.created",
        data: { id: dataId }
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: { status: "noop", orderId } });

    // The order stays cancelled: no flip to paid, no stock movement.
    expect(await readOrderStatus(orderId)).toMatchObject({ status: "Cancelado", payment_status: "Cancelado" });
    expect(await productStock(bateria)).toBe(8);
  });
});

async function productStock(productId: string): Promise<number> {
  const { rows } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [productId]);
  return rows[0].stock;
}
