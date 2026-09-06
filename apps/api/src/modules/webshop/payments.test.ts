/**
 * MercadoPago payments integration tests (issue #84) over HTTP + Postgres.
 *
 * Covers the preference mint (MP fetch stubbed) and the IPN webhook end to
 * end: signature verification with a real HMAC, approved → paid + stock
 * commit, oversell → paid with stock_committed=false, dedupe on redelivery,
 * and every non-moving outcome (ignored/unmapped/noop/not_approved) leaving
 * orders intact. Runs against beim_api_test (see src/db/testDb.ts).
 */
import { createHmac, randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Fake, inoffensive test values (never real credentials).
process.env.MP_ACCESS_TOKEN = "TEST-ACCESS-TOKEN";
process.env.MP_WEBHOOK_SECRET = "test-webhook-secret-abc123";
process.env.MP_NOTIFICATION_URL = "https://api.beim.test/api/v1/webhooks/mercadopago";
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
  price: number;
  stock: number;
  currency?: string;
}): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published)
     VALUES ($1, $2, 'celulares', '', '', $3, $4, $5, 'Nuevo', '', true)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, price = EXCLUDED.price, currency = EXCLUDED.currency,
           stock = EXCLUDED.stock, updated_at = now()`,
    [input.id, input.name, input.price, input.currency ?? "UYU", input.stock]
  );
  return input.id;
}

async function seedUser(overrides: { id?: string; email?: string } = {}) {
  const id = overrides.id ?? randomUUID();
  const email = overrides.email ?? `mp-${id.slice(0, 8)}@beim.test`;
  const passwordHash = await hashPassword("Secreto-123!");
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1::uuid, 'Comprador MP', 'comprador-mp-' || $1::text, $2, $3, 'cliente', true)
     ON CONFLICT (id) DO NOTHING`,
    [id, email, passwordHash]
  );
  return { id, email };
}

async function login(email: string): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier: email, password: "Secreto-123!" });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

async function createOrder(token: string, productId: string, quantity: number): Promise<string> {
  const res = await request(app)
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({ customer: "Comprador MP", items: [{ productId, quantity }] });
  expect(res.status).toBe(201);
  return res.body.data.order.id as string;
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

function webhookBody(notificationId: string, type: string, dataId: string): Record<string, unknown> {
  // Extra MP fields ride along (catchall schema must not 422 them).
  return {
    id: notificationId,
    live_mode: true,
    type,
    action: "payment.created",
    api_version: "v1",
    date_created: "2024-01-01T00:00:00Z",
    user_id: "123456",
    data: { id: dataId }
  };
}

function stubPayment(payment: { id: number; status: string; external_reference: string | null }, dataId: string): void {
  vi.stubGlobal(
    "fetch",
    async (url: unknown) => {
      expect(String(url)).toBe(`https://api.mercadopago.com/v1/payments/${dataId}`);
      return { ok: true, json: async () => payment };
    }
  );
}

interface OrderMpRow {
  payment_status: string;
  stock_committed: boolean;
  mp_payment_id: string | null;
  mp_preference_id: string | null;
  paid_at: Date | null;
}

async function readOrderMp(orderId: string): Promise<OrderMpRow> {
  const { rows } = await query<OrderMpRow>(
    "SELECT payment_status, stock_committed, mp_payment_id, mp_preference_id, paid_at FROM orders WHERE id = $1",
    [orderId]
  );
  return rows[0];
}

async function productStock(productId: string): Promise<number> {
  const { rows } = await query<{ stock: number }>("SELECT stock FROM products WHERE id = $1", [productId]);
  return rows[0].stock;
}

describePg("mercadopago payment preferences", () => {
  it("mints a preference for an owned pending order and persists mp_preference_id", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Pagable", price: 1500, stock: 6 });
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, productId, 2);

    let captured: Record<string, unknown> = {};
    vi.stubGlobal(
      "fetch",
      async (url: unknown, init?: { body?: unknown; headers?: unknown }) => {
        expect(String(url)).toBe("https://api.mercadopago.com/checkout/preferences");
        captured = JSON.parse(String(init?.body));
        return {
          ok: true,
          json: async () => ({ id: "pref-111", init_point: "https://mp.test/pay/pref-111" })
        };
      }
    );

    const res = await request(app).post(`/api/v1/orders/${orderId}/payment-preference`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, data: { preferenceId: "pref-111", initPoint: "https://mp.test/pay/pref-111" } });

    expect(captured).toMatchObject({
      external_reference: orderId,
      notification_url: "https://api.beim.test/api/v1/webhooks/mercadopago",
      items: [{ title: "MP Pagable", quantity: 2, unit_price: 1500, currency_id: "UYU" }]
    });
    const row = await readOrderMp(orderId);
    expect(row.mp_preference_id).toBe("pref-111");
    expect(row.payment_status).toBe("Pendiente de pago");
  });

  it("answers 404 for foreign orders and 503 without MP_ACCESS_TOKEN", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Ajeno", price: 100, stock: 5 });
    const me = await seedUser();
    const other = await seedUser();
    const myToken = await login(me.email);
    const otherToken = await login(other.email);
    const orderId = await createOrder(myToken, productId, 1);

    const foreign = await request(app)
      .post(`/api/v1/orders/${orderId}/payment-preference`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(foreign.status).toBe(404);

    const saved = process.env.MP_ACCESS_TOKEN;
    delete process.env.MP_ACCESS_TOKEN;
    try {
      const res = await request(app)
        .post(`/api/v1/orders/${orderId}/payment-preference`)
        .set("Authorization", `Bearer ${myToken}`);
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } });
    } finally {
      process.env.MP_ACCESS_TOKEN = saved;
    }
  });
});

describePg("mercadopago webhook", () => {
  it("pays an approved order: paid + stock committed + event recorded", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Cobrable", price: 2000, stock: 5 });
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, productId, 2);
    const notificationId = `evt-${randomUUID()}`;
    const dataId = "987654321";
    stubPayment({ id: 987654321, status: "approved", external_reference: orderId }, dataId);

    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId, "req-1"))
      .send(webhookBody(notificationId, "payment", dataId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: { status: "paid", orderId } });

    const row = await readOrderMp(orderId);
    expect(row.payment_status).toBe("Pagado");
    expect(row.stock_committed).toBe(true);
    expect(row.mp_payment_id).toBe("987654321");
    expect(row.paid_at).not.toBeNull();
    expect(await productStock(productId)).toBe(3);

    const { rows: events } = await query<{ status: string; order_id: string }>(
      "SELECT status, order_id FROM webhook_events WHERE provider = 'mercadopago' AND event_id = $1",
      [notificationId]
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "paid", order_id: orderId });
  });

  it("dedupes a redelivered event: single stock effect, single event row", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Unico", price: 500, stock: 4 });
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, productId, 1);
    const notificationId = `evt-${randomUUID()}`;
    const dataId = "555555555";
    stubPayment({ id: 555555555, status: "approved", external_reference: orderId }, dataId);
    const headers = signHeaders(dataId);
    const body = webhookBody(notificationId, "payment", dataId);

    const first = await request(app).post("/api/v1/webhooks/mercadopago").set(headers).send(body);
    expect(first.status).toBe(200);
    const second = await request(app).post("/api/v1/webhooks/mercadopago").set(headers).send(body);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, data: { status: "deduped" } });

    expect(await productStock(productId)).toBe(3);
    const { rows } = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM webhook_events WHERE provider = 'mercadopago' AND event_id = $1",
      [notificationId]
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("rejects a bad or missing signature with 403", async () => {
    const notificationId = `evt-${randomUUID()}`;
    const body = webhookBody(notificationId, "payment", "111222333");

    const missing = await request(app).post("/api/v1/webhooks/mercadopago").send(body);
    expect(missing.status).toBe(403);

    const bad = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set({ "x-signature": "ts=1704908010,v1=muerta" })
      .send(body);
    expect(bad.status).toBe(403);

    const { rows } = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM webhook_events WHERE provider = 'mercadopago' AND event_id = $1",
      [notificationId]
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("ignores non-payment topics with 200 and leaves the order intact", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Intacto", price: 700, stock: 5 });
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, productId, 1);
    const notificationId = `evt-${randomUUID()}`;
    const dataId = "424242424";
    stubPayment({ id: 424242424, status: "approved", external_reference: orderId }, dataId);

    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId))
      .send(webhookBody(notificationId, "merchant_order", dataId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: { status: "ignored" } });

    const row = await readOrderMp(orderId);
    expect(row.payment_status).toBe("Pendiente de pago");
    expect(await productStock(productId)).toBe(5);
  });

  it("leaves the order intact on non-approved payments", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Rechazado", price: 300, stock: 5 });
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, productId, 1);
    const notificationId = `evt-${randomUUID()}`;
    const dataId = "313131313";
    stubPayment({ id: 313131313, status: "rejected", external_reference: orderId }, dataId);

    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId))
      .send(webhookBody(notificationId, "payment", dataId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: { status: "not_approved", orderId } });

    const row = await readOrderMp(orderId);
    expect(row.payment_status).toBe("Pendiente de pago");
    expect(row.stock_committed).toBe(false);
    expect(await productStock(productId)).toBe(5);
  });

  it("marks unknown external references as unmapped without touching orders", async () => {
    const dataId = "777888999";
    stubPayment({ id: 777888999, status: "approved", external_reference: "orden-fantasma" }, dataId);
    const notificationId = `evt-${randomUUID()}`;

    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId))
      .send(webhookBody(notificationId, "payment", dataId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: { status: "unmapped" } });

    const { rows } = await query<{ status: string }>(
      "SELECT status FROM webhook_events WHERE provider = 'mercadopago' AND event_id = $1",
      [notificationId]
    );
    expect(rows[0].status).toBe("unmapped");
  });

  it("noops an approved payment for an already-paid order", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Pagada", price: 900, stock: 5 });
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, productId, 2);
    const dataId = "121212121";
    stubPayment({ id: 121212121, status: "approved", external_reference: orderId }, dataId);

    const first = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId))
      .send(webhookBody(`evt-${randomUUID()}`, "payment", dataId));
    expect(first.body.data.status).toBe("paid");

    const second = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId))
      .send(webhookBody(`evt-${randomUUID()}`, "payment", dataId));
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ ok: true, data: { status: "noop", orderId } });
    expect(await productStock(productId)).toBe(3);
  });

  it("keeps the order paid with stock_committed=false on oversell", async () => {
    const productId = await seedProduct({ id: randomUUID(), name: "MP Oversell", price: 400, stock: 1 });
    const user = await seedUser();
    const token = await login(user.email);
    const orderId = await createOrder(token, productId, 1);
    // A concurrent sale drains the last unit before the IPN arrives.
    await query("UPDATE products SET stock = 0 WHERE id = $1", [productId]);

    const dataId = "999000111";
    stubPayment({ id: 999000111, status: "approved", external_reference: orderId }, dataId);
    const res = await request(app)
      .post("/api/v1/webhooks/mercadopago")
      .set(signHeaders(dataId))
      .send(webhookBody(`evt-${randomUUID()}`, "payment", dataId));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, data: { status: "paid_oversell", orderId } });

    const row = await readOrderMp(orderId);
    expect(row.payment_status).toBe("Pagado");
    expect(row.stock_committed).toBe(false);
    expect(await productStock(productId)).toBe(0);
  });
});
