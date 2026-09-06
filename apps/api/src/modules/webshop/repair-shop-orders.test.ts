/**
 * Repair-shop integration tests (webshop module) — cell-phone workshop domain.
 *
 * Covers the parts storefront end to end over HTTP: the public catalog
 * (published-only reads), an authenticated parts order with server-side
 * pricing (check-not-reserve: stock is untouched until payment), ownership-
 * scoped order reads, and a pending checkout session. Runs against
 * beim_api_test (see src/db/testDb.ts).
 */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import request from "supertest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Checkout sessions build their payment URL from this base (same override as
// webshop-api.test.ts). The catalog/orders helpers below are exact copies of
// the catalog-orders.test.ts / webshop-api.test.ts helpers.
process.env.CHECKOUT_BASE_URL = "https://checkout.beim.test";
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

setupTestDatabase();

const { query } = await import("../../config/db.js");
const { hashPassword } = await import("./services/auth.js");
const { createApp } = await import("../../app.js");

const app = createApp();

async function seedProduct(input: {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  stock: number;
  currency?: string;
  brand?: string;
  model?: string;
  published?: boolean;
}): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Nuevo', '', $9)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, price = EXCLUDED.price,
           currency = EXCLUDED.currency, stock = EXCLUDED.stock, brand = EXCLUDED.brand,
           model = EXCLUDED.model, published = EXCLUDED.published, updated_at = now()`,
    [
      input.id,
      input.name,
      input.categoryId,
      input.brand ?? "",
      input.model ?? "",
      input.price,
      input.currency ?? "UYU",
      input.stock,
      input.published ?? true
    ]
  );
  return input.id;
}

async function seedUser(overrides: { id?: string; name?: string; email?: string; approve?: boolean } = {}) {
  const id = overrides.id ?? randomUUID();
  const name = overrides.name ?? "Comprador Web";
  const email = overrides.email ?? `web-${id.slice(0, 8)}@beim.test`;
  const passwordHash = await hashPassword("Secreto-123!");
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1::uuid, $2, $2::text || '-' || $1::text, $3, $4, 'cliente', $5)
     ON CONFLICT (id) DO NOTHING`,
    [id, name, email, passwordHash, overrides.approve ?? true]
  );
  return { id, email };
}

async function login(email: string, password = "Secreto-123!"): Promise<string> {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier: email, password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

const CATEGORY_ID = "celulares";

async function seedWorkshopCatalog(): Promise<{ pantalla: string; bateria: string; funda: string }> {
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
  const funda = await seedProduct({
    id: randomUUID(),
    name: "Funda silicona",
    categoryId: CATEGORY_ID,
    price: 190,
    stock: 20
  });
  return { pantalla, bateria, funda };
}

describePg("repair shop: public catalog", () => {
  it("lists published parts without auth and serves a single part by id", async () => {
    const { pantalla } = await seedWorkshopCatalog();

    const list = await request(app).get("/api/v1/products");
    expect(list.status).toBe(200);
    expect(list.body.ok).toBe(true);
    expect(list.body.data.items.map((p: { name: string }) => p.name)).toContain("Pantalla iPhone 13");

    const one = await request(app).get(`/api/v1/products/${pantalla}`);
    expect(one.status).toBe(200);
    expect(one.body.ok).toBe(true);
    expect(one.body.data.name).toBe("Pantalla iPhone 13");
  });
});

describePg("repair shop: parts order", () => {
  it("registers, logs in, orders parts, and mints a pending checkout session", async () => {
    const { pantalla, funda } = await seedWorkshopCatalog();

    const email = "lucia.f@ejemplo.uy";
    const registered = await request(app).post("/api/v1/auth/register").send({
      name: "Lucía Fernández",
      email,
      password: "Reparo-1234!"
    });
    expect(registered.status).toBe(201);
    expect(registered.body.ok).toBe(true);
    expect(registered.body.data.user.role).toBe("cliente");

    // Registration leaves the account unapproved (login would be 401), so the
    // workshop approves Lucía before she can order.
    await query("UPDATE users SET is_approved = true WHERE email = $1", [email]);
    const token = await login(email, "Reparo-1234!");

    const created = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        customer: "Lucía Fernández",
        phone: "+598 99 444 555",
        address: "Av. 18 de Julio 1234, Montevideo",
        items: [
          { productId: pantalla, quantity: 1 },
          { productId: funda, quantity: 2 }
        ]
      });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    expect(created.body.data.order.total).toBe(3180);
    expect(created.body.data.order.paymentStatus).toBe("Pendiente de pago");
    const orderId = created.body.data.order.id as string;

    const one = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(one.status).toBe(200);
    expect(one.body.ok).toBe(true);
    expect(one.body.data.order.id).toBe(orderId);

    const list = await request(app).get("/api/v1/orders").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((o: { id: string }) => o.id)).toContain(orderId);

    const other = await seedUser({ name: "Otro Taller" });
    const otherToken = await login(other.email);
    const foreign = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(foreign.status).toBe(404);

    const noToken = await request(app).get(`/api/v1/orders/${orderId}`);
    expect(noToken.status).toBe(401);
    expect(noToken.body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });

    const garbage = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set("Authorization", "Bearer token-basura");
    expect(garbage.status).toBe(401);
    expect(garbage.body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });

    const session = await request(app)
      .post("/api/v1/checkout-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId });
    expect(session.status).toBe(201);
    expect(session.body.ok).toBe(true);
    expect(session.body.data.status).toBe("pending");

    // Orders check stock but never reserve it: the screen still shows 5 units.
    const part = await request(app).get(`/api/v1/products/${pantalla}`);
    expect(part.status).toBe(200);
    expect(part.body.data.stock).toBe(5);
  });
});
