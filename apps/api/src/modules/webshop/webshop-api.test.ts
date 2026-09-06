/**
 * Webshop HTTP API tests (PR 4) — webshop-api/spec.md end to end.
 *
 * Focus on the API surface: auth flows (login/register/gestion-access),
 * token-protected orders + checkout, public catalog (published-only) and
 * slides, and raw-binary image uploads/serving (415/413/404 envelope paths).
 * Pricing/stock rules live in the service tests; here we prove the wire
 * contract (status + envelope shape).
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import request from "supertest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Point uploads at a temp dir and keep the cap small for the 413 case.
// webshopConfig() is read lazily per request, so per-test env overrides work.
const uploadsDir = mkdtempSync(join(tmpdir(), "beim-uploads-"));
process.env.UPLOADS_DIR = uploadsDir;
process.env.MAX_UPLOAD_BYTES = "1048576";
process.env.CHECKOUT_BASE_URL = "https://checkout.beim.test";

setupTestDatabase();

const { query } = await import("../../config/db.js");
const { authService, hashPassword } = await import("./services/auth.js");
const { hashToken } = await import("./repositories/pg-auth.js");
const { createApp } = await import("../../app.js");

const app = createApp();

const USER_IDS = new Set<string>();

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

async function seedProduct(input: {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  stock: number;
  published?: boolean;
}): Promise<void> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published)
     VALUES ($1::uuid, $2, $3, '', '', $4, 'UYU', $5, 'Nuevo', '', $6)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price,
       stock = EXCLUDED.stock, published = EXCLUDED.published, updated_at = now()`,
    [input.id, input.name, input.categoryId, input.price, input.stock, input.published ?? true]
  );
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);

describePg("webshop auth over HTTP", () => {
  it("register creates an unapproved cliente, login rejects it with a uniform 401", async () => {
    const email = `registro-${randomUUID().slice(0, 8)}@beim.test`;
    const res = await request(app).post("/api/v1/auth/register").send({
      name: "Nuevo Cliente",
      email,
      password: "Secreto-123!"
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe("cliente");
    expect(res.body.data.user.isApproved).toBe(false);
    expect(res.body.data.token).toBeUndefined();

    const bad = await request(app).post("/api/v1/auth/login").send({ identifier: email, password: "Secreto-123!" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("login rejects wrong credentials with 401 and unknown users look identical", async () => {
    const user = await seedUser();
    const wrong = await request(app).post("/api/v1/auth/login").send({ identifier: user.email, password: "Erronea-1234!" });
    const ghost = await request(app)
      .post("/api/v1/auth/login")
      .send({ identifier: `ghost-${randomUUID()}@beim.test`, password: "Erronea-1234!" });
    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect(wrong.body.error.code).toBe(ghost.body.error.code);
  });

  it("gestion-access exchanges a valid bridge token for a webshop session; expired → 401", async () => {
    const webUser = await seedUser();
    const { rows: gestionUsers } = await query<{ id: string }>(
      "SELECT id::text AS id FROM gestion_users ORDER BY id LIMIT 1"
    );
    const gestionUserId =
      gestionUsers[0]?.id ??
      (
        await query<{ id: string }>(
          `INSERT INTO gestion_users (username, name, password_hash, role)
           VALUES ('gestor-bridge', 'Gestor Bridge', 'irrelevant', 'vendedor')
           RETURNING id::text AS id`
        )
      ).rows[0].id;

    const raw = randomUUID();
    await query(
      `INSERT INTO gestion_web_access_tokens (token_hash, web_user_id, gestion_user_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [hashToken(raw), webUser.id, gestionUserId]
    );
    const ok = await request(app).post("/api/v1/auth/gestion-access").send({ token: raw });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
    expect(ok.body.data.expiresAt).toBeTruthy();

    const expiredRaw = randomUUID();
    await query(
      `INSERT INTO gestion_web_access_tokens (token_hash, web_user_id, gestion_user_id, expires_at)
       VALUES ($1, $2, $3, now() - interval '1 hour')`,
      [hashToken(expiredRaw), webUser.id, gestionUserId]
    );
    const expired = await request(app).post("/api/v1/auth/gestion-access").send({ token: expiredRaw });
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("logout revokes the session (old token → 401); anonymous logout → 401; logout twice → 200 both", async () => {
    const anonymous = await request(app).post("/api/v1/auth/logout");
    expect(anonymous.status).toBe(401);

    const user = await seedUser();
    const first = await login(user.email);
    const out1 = await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${first}`);
    expect(out1.status).toBe(200);
    expect(out1.body).toMatchObject({ ok: true, data: { loggedOut: true } });

    const blocked = await request(app).get("/api/v1/orders").set("Authorization", `Bearer ${first}`);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe("AUTHENTICATION_REQUIRED");

    const second = await login(user.email);
    const out2 = await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${second}`);
    expect(out2.status).toBe(200);
  });

  it("duplicate registration answers 201 with a null user (no existence oracle)", async () => {
    const email = `dup-${randomUUID().slice(0, 8)}@beim.test`;
    const first = await request(app).post("/api/v1/auth/register").send({
      name: "Duplicado",
      email,
      password: "Secreto-123!"
    });
    expect(first.status).toBe(201);
    expect(first.body.data.user.email).toBe(email);

    const second = await request(app).post("/api/v1/auth/register").send({
      name: "Otro Duplicado",
      email,
      password: "Secreto-123!"
    });
    expect(second.status).toBe(201);
    expect(second.body.data.user).toBeNull();
  });

  it("expired webshop sessions are rejected with 401", async () => {
    const user = await seedUser();
    const res = await request(app).post("/api/v1/auth/login").send({ identifier: user.email, password: "Secreto-123!" });
    const token = res.body.data.token as string;
    await query("UPDATE webshop_sessions SET expires_at = now() - interval '1 day'");
    const blocked = await request(app).get("/api/v1/orders").set("Authorization", `Bearer ${token}`);
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });
});

describePg("webshop catalog over HTTP", () => {
  it("GET /products returns published items with pagination and hides unpublished", async () => {
    await seedProduct({ id: randomUUID(), name: "Visible Web", categoryId: "celulares", price: 100, stock: 5 });
    await seedProduct({ id: randomUUID(), name: "Oculto Web", categoryId: "celulares", price: 100, stock: 5, published: false });

    const res = await request(app).get("/api/v1/products?page=1&limit=2");
    expect(res.status).toBe(200);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.items.length).toBeLessThanOrEqual(2);
    expect(res.body.data.items.map((p: { name: string }) => p.name)).not.toContain("Oculto Web");
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  it("GET /products/:id serves a published product and 404s unpublished/unknown ids", async () => {
    const visible = randomUUID();
    const hidden = randomUUID();
    await seedProduct({ id: visible, name: "Solo Publicado", categoryId: "celulares", price: 100, stock: 5 });
    await seedProduct({ id: hidden, name: "No Publicado", categoryId: "celulares", price: 100, stock: 5, published: false });

    const ok = await request(app).get(`/api/v1/products/${visible}`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.name).toBe("Solo Publicado");

    const hiddenRes = await request(app).get(`/api/v1/products/${hidden}`);
    expect(hiddenRes.status).toBe(404);
    const ghost = await request(app).get(`/api/v1/products/${randomUUID()}`);
    expect(ghost.status).toBe(404);
  });

  it("GET /promo-slides returns published slides only", async () => {
    await query(
      `INSERT INTO promo_slides (id, eyebrow, title, text, image, sort_order, published)
       VALUES ($1::uuid, 'W', 'Web Slide', '', 'assets/w.png', 1, true)`,
      [randomUUID()]
    );
    const res = await request(app).get("/api/v1/promo-slides");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.map((s: { title: string }) => s.title)).toContain("Web Slide");
  });
});

describePg("webshop orders over HTTP", () => {
  it("orders require a bearer token; with one the flow works end to end", async () => {
    const productId = randomUUID();
    await seedProduct({ id: productId, name: "Pedible", categoryId: "celulares", price: 250, stock: 4 });
    const user = await seedUser();
    const token = await login(user.email);

    const unauthenticated = await request(app).post("/api/v1/orders").send({ customer: "X", items: [{ productId, quantity: 1 }] });
    expect(unauthenticated.status).toBe(401);

    const created = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ customer: "Comprador HTTP", email: `http-${user.id.slice(0, 8)}@beim.test`, items: [{ productId, quantity: 2 }] });
    expect(created.status).toBe(201);
    expect(created.body.data.order.paymentStatus).toBe("Pendiente de pago");
    expect(created.body.data.order.total).toBe(500);
    const orderId = created.body.data.order.id as string;

    const list = await request(app).get("/api/v1/orders").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((o: { id: string }) => o.id)).toContain(orderId);

    const one = await request(app).get(`/api/v1/orders/${orderId}`).set("Authorization", `Bearer ${token}`);
    expect(one.status).toBe(200);
    expect(one.body.data.order.id).toBe(orderId);
  });

  it("insufficient stock → 409, ownership → 404, unknown product → 404", async () => {
    const low = randomUUID();
    await seedProduct({ id: low, name: "Poco Stock", categoryId: "celulares", price: 10, stock: 1 });
    const me = await seedUser();
    const other = await seedUser();
    const token = await login(me.email);
    const otherToken = await login(other.email);

    const conflict = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ customer: "X", items: [{ productId: low, quantity: 2 }] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("INSUFFICIENT_STOCK");

    const unknown = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ customer: "X", items: [{ productId: randomUUID(), quantity: 1 }] });
    expect(unknown.status).toBe(404);

    // Someone else's order is invisible (404, no hint).
    const productId = randomUUID();
    await seedProduct({ id: productId, name: "Mio", categoryId: "celulares", price: 10, stock: 5 });
    const mine = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ customer: "X", items: [{ productId, quantity: 1 }] });
    const foreign = await request(app)
      .get(`/api/v1/orders/${mine.body.data.order.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(foreign.status).toBe(404);
  });
});

describePg("webshop checkout + uploads over HTTP", () => {
  it("checkout-session mints a pending session with a payment URL; paid orders conflict", async () => {
    const productId = randomUUID();
    await seedProduct({ id: productId, name: "Pagable", categoryId: "celulares", price: 50, stock: 5 });
    const user = await seedUser();
    const token = await login(user.email);
    const order = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ customer: "Paga Web", items: [{ productId, quantity: 1 }] });
    const orderId = order.body.data.order.id;

    const session = await request(app)
      .post("/api/v1/checkout-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId, paymentMethodId: "transferencia-bancaria" });
    expect(session.status).toBe(201);
    expect(session.body.data.status).toBe("pending");
    expect(session.body.data.url).toMatch(new RegExp(`^https://checkout\\.beim\\.test/checkout/`));

    const paid = await request(app)
      .post("/api/v1/checkout-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId, paymentMethodId: "tarjeta" });
    expect(paid.status).toBe(409);
    expect(paid.body.error.code).toBe("CONFLICT");
  });

  it("uploads require auth + admin, reject non-image content and oversize bodies, then serve the file", async () => {
    const cliente = await seedUser();
    const clienteToken = await login(cliente.email);
    const forbidden = await request(app)
      .post("/api/v1/uploads/product-image")
      .set("Authorization", `Bearer ${clienteToken}`)
      .set("Content-Type", "image/png")
      .send(PNG_BYTES);
    expect(forbidden.status).toBe(403);

    // Uploads land in the public catalog: only admin sessions may write.
    const user = await seedUser();
    await query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
    const token = await login(user.email);

    const noAuth = await request(app)
      .post("/api/v1/uploads/product-image")
      .set("Content-Type", "image/png")
      .send(PNG_BYTES);
    expect(noAuth.status).toBe(401);

    const badType = await request(app)
      .post("/api/v1/uploads/product-image")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "text/plain")
      .send("no soy una imagen");
    expect(badType.status).toBe(415);

    const missingType = await request(app)
      .post("/api/v1/uploads/product-image")
      .set("Authorization", `Bearer ${token}`);
    expect(missingType.status).toBe(415);
    expect(missingType.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    process.env.MAX_UPLOAD_BYTES = "8";
    const tooBig = await request(app)
      .post("/api/v1/uploads/product-image")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/png")
      .send(PNG_BYTES);
    expect(tooBig.status).toBe(413);
    process.env.MAX_UPLOAD_BYTES = "1048576";

    const upload = await request(app)
      .post("/api/v1/uploads/product-image")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/png")
      .send(PNG_BYTES);
    expect(upload.status).toBe(201);
    const filename = (upload.body.data.url as string).split("/").pop() as string;
    expect(filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(readFileSync(join(uploadsDir, filename))).toEqual(PNG_BYTES);

    const served = await request(app).get(`/api/v1/uploads/${filename}`);
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toContain("image/png");
    expect(served.body).toEqual(PNG_BYTES);

    const traversal = await request(app).get("/api/v1/uploads/..%2Fenv.json");
    expect(traversal.status).toBe(404);
    const missing = await request(app).get(`/api/v1/uploads/${randomUUID()}.png`);
    expect(missing.status).toBe(404);
  });

  it("unmatched routes fall through to the 404 envelope", async () => {
    const res = await request(app).get("/api/v1/no-such-route");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });
});