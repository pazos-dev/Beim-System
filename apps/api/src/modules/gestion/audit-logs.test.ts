/**
 * Audit-trail tests (issue #97) through createApp + Postgres.
 *
 * Covers the admin-only read (`GET /api/v1/audit-logs`: auth matrix,
 * action/actor/date filters, pagination) and proves the journals added in
 * this change actually fire: sales-batch, annul and paid orders (service
 * direct), plus user-admin approve and login. Runs against beim_api_test
 * (see src/db/testDb.ts).
 */
import { createHmac, randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterEach, expect, it, vi } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Fake, inoffensive test values (never real credentials).
process.env.MP_ACCESS_TOKEN = "TEST-ACCESS-TOKEN";
process.env.MP_WEBHOOK_SECRET = "test-webhook-secret-abc123";
process.env.MP_NOTIFICATION_URL = "https://api.beim.test/api/v1/webhooks/mercadopago";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top:
// createApp pulls in the router → services → config/db, which builds the
// shared Pool from DATABASE_URL at module evaluation time.
const { createApp } = await import("../../app.js");
const { query } = await import("../../config/db.js");
const { auditLogsRepository } = await import("./repositories/pg-audit-logs.js");
const { auditLogsService } = await import("./services/audit-logs.js");
const { salesBatchService } = await import("./services/sales-batch.js");
const { receiptsService } = await import("./services/receipts.js");
const { usersService } = await import("./services/users.js");
const { authService, hashPassword } = await import("../webshop/services/auth.js");
const { ordersService } = await import("../webshop/services/orders.js");
const { paymentsService } = await import("../webshop/services/payments.js");

afterEach(() => {
  vi.unstubAllGlobals();
});

interface TestIdentityOptions {
  roles?: string[] | null;
  userId?: string;
}

/** createApp with an injected identity (tests stand in for the auth module). */
function appWith({ roles, userId }: TestIdentityOptions = {}): Express {
  return createApp({
    resolveIdentity:
      roles === undefined || roles === null
        ? undefined
        : () => ({ userId: userId ?? "u-test", roles })
  });
}

const OPERATOR = ["vendedor"];
const ADMIN = ["administrador"];

async function seedProduct(id: string, stock: number, price = 100, published = false): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description, published)
     VALUES ($1, 'Audit seed', 'celulares', '', '', $3, 'UYU', $2, 'Nuevo', '', $4)
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price, updated_at = now()`,
    [id, stock, price, published]
  );
  return id;
}

async function seedWebUser(overrides: { email?: string; approve?: boolean; role?: string } = {}): Promise<{
  id: string;
  email: string;
}> {
  const id = randomUUID();
  const email = overrides.email ?? `audit-${id.slice(0, 8)}@beim.test`;
  const passwordHash = await hashPassword("Secreto-123!");
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1::uuid, 'Usuario Audit', $2, $3, $4, $5, $6)`,
    [id, `ua-${id.slice(0, 8)}`, email, passwordHash, overrides.role ?? "cliente", overrides.approve ?? true]
  );
  return { id, email };
}

async function journalCount(action: string, entityId?: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM audit_logs WHERE action = $1 AND ($2::text IS NULL OR entity_id = $2)",
    [action, entityId ?? null]
  );
  return Number(rows[0].n);
}

function signHeaders(dataId: string): Record<string, string> {
  const secret = process.env.MP_WEBHOOK_SECRET as string;
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${dataId};request-id:;ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}` };
}

describePg("audit-logs read — auth matrix", () => {
  it("anonymous caller sees 404 (never a hint the resource exists)", async () => {
    const res = await request(appWith()).get("/api/v1/audit-logs");
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it("operator role is forbidden (403)", async () => {
    const res = await request(appWith({ roles: OPERATOR })).get("/api/v1/audit-logs");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("admin gets 200 with the {items,total,page,limit} envelope, newest first", async () => {
    const action = `test.matrix.${randomUUID()}`;
    const first = await auditLogsRepository.insert({ action, entityType: "test", details: {} });
    const second = await auditLogsRepository.insert({ action, entityType: "test", details: {} });

    const res = await request(appWith({ roles: ADMIN })).get("/api/v1/audit-logs").query({ action });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(20);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items.map((row: { id: string }) => row.id)).toEqual([second.id, first.id]);
    for (const item of res.body.data.items as Array<Record<string, unknown>>) {
      expect(Object.keys(item).sort()).toEqual(
        ["action", "actorRole", "actorUserId", "createdAt", "details", "entityId", "entityType", "id"].sort()
      );
    }
  });
});

describePg("audit-logs read — filters", () => {
  it("filters by exact action", async () => {
    const wanted = `test.action.wanted.${randomUUID()}`;
    const other = `test.action.other.${randomUUID()}`;
    await auditLogsRepository.insert({ action: wanted, entityType: "test", details: {} });
    await auditLogsRepository.insert({ action: other, entityType: "test", details: {} });

    const res = await request(appWith({ roles: ADMIN })).get("/api/v1/audit-logs").query({ action: wanted });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].action).toBe(wanted);
  });

  it("filters by actor uuid", async () => {
    const actorA = (await seedWebUser()).id;
    const actorB = (await seedWebUser()).id;
    const action = `test.actor.${randomUUID()}`;
    await auditLogsRepository.insert({ action, entityType: "test", actorUserId: actorA, details: {} });
    await auditLogsRepository.insert({ action, entityType: "test", actorUserId: actorB, details: {} });

    const res = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/audit-logs")
      .query({ action, actor: actorA });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].actorUserId).toBe(actorA);
  });

  it("filters by date range (from/to YYYY-MM-DD)", async () => {
    const action = `test.dates.${randomUUID()}`;
    const row = await auditLogsRepository.insert({ action, entityType: "test", details: {} });
    await query("UPDATE audit_logs SET created_at = '2020-05-05T12:00:00Z' WHERE id = $1", [row.id]);

    const excluded = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/audit-logs")
      .query({ action, from: "2021-01-01" });
    expect(excluded.body.data.total).toBe(0);

    const included = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/audit-logs")
      .query({ action, to: "2021-01-01" });
    expect(included.body.data.total).toBe(1);

    const badDate = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/audit-logs")
      .query({ action, from: "05/05/2020" });
    expect(badDate.status).toBe(422);
  });
});

describePg("audit-logs read — pagination", () => {
  it("paginates with page/limit defaults (1/20, max 100) and rejects limit > 100", async () => {
    const action = `test.pages.${randomUUID()}`;
    for (let i = 0; i < 5; i += 1) {
      await auditLogsRepository.insert({ action, entityType: "test", details: { i } });
    }

    const first = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/audit-logs")
      .query({ action, limit: 2 });
    expect(first.body.data).toMatchObject({ total: 5, page: 1, limit: 2 });
    expect(first.body.data.items).toHaveLength(2);

    const third = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/audit-logs")
      .query({ action, limit: 2, page: 3 });
    expect(third.body.data).toMatchObject({ total: 5, page: 3, limit: 2 });
    expect(third.body.data.items).toHaveLength(1);

    const tooBig = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/audit-logs")
      .query({ action, limit: 101 });
    expect(tooBig.status).toBe(422);
  });
});

describePg("audit-logs journals — sales, annul, paid orders", () => {
  it("sales-batch (service direct) journals sale.create with the actor", async () => {
    const actor = (await seedWebUser()).id;
    const productId = await seedProduct(`audit-sale-${randomUUID()}`, 5, 100);
    const result = await salesBatchService.run(
      {
        clientName: "Cliente Audit",
        clientId: "audit-cli-1",
        items: [{ productId, quantity: 2 }],
        payments: [{ method: "Efectivo", amount: 200 }]
      },
      { actorUserId: actor, actorRole: "vendedor" }
    );

    const { rows } = await query<{ actor_user_id: string; actor_role: string; details: unknown }>(
      "SELECT actor_user_id, actor_role, details FROM audit_logs WHERE action = 'sale.create' AND entity_id = $1",
      [result.receipt.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe(actor);
    expect(rows[0].actor_role).toBe("vendedor");
    expect(rows[0].details).toMatchObject({ receiptId: result.receipt.id, total: 200 });
  });

  it("annul (service direct) journals receipt.annul with the actor", async () => {
    const actor = (await seedWebUser()).id;
    const productId = await seedProduct(`audit-annul-${randomUUID()}`, 5, 100);
    const sale = await salesBatchService.run(
      {
        clientName: "Para Anular Audit",
        clientId: "audit-cli-2",
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "Efectivo", amount: 100 }]
      },
      { actorUserId: actor, actorRole: "vendedor" }
    );
    await receiptsService.annul(sale.receipt.id, { actorUserId: actor, actorRole: "vendedor" });

    expect(await journalCount("receipt.annul", sale.receipt.id)).toBe(1);
    const { rows } = await query<{ actor_user_id: string }>(
      "SELECT actor_user_id FROM audit_logs WHERE action = 'receipt.annul' AND entity_id = $1",
      [sale.receipt.id]
    );
    expect(rows[0].actor_user_id).toBe(actor);
  });

  it("paid order (webhook path) journals order.paid with null actor + source", async () => {
    const productId = await seedProduct(randomUUID(), 5, 2000, true);
    const user = await seedWebUser();
    const order = await ordersService.create(user.id, {
      customer: "Comprador Audit",
      items: [{ productId, quantity: 1 }]
    });
    const notificationId = `evt-${randomUUID()}`;
    const dataId = "112233445";
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ id: 112233445, status: "approved", external_reference: order.order.id })
    }));

    const outcome = await paymentsService.handlePaymentNotification({
      notificationId,
      type: "payment",
      dataId,
      xSignature: signHeaders(dataId)["x-signature"] as string
    });
    expect(outcome.outcome).toBe("paid");

    const { rows } = await query<{ actor_user_id: string | null; details: Record<string, unknown> }>(
      "SELECT actor_user_id, details FROM audit_logs WHERE action = 'order.paid' AND entity_id = $1",
      [order.order.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBeNull();
    expect(rows[0].details).toMatchObject({ orderId: order.order.id, source: "mercadopago-webhook" });
  });

  it("HTTP sale carries the request identity as journal actor", async () => {
    const admin = await seedWebUser({ role: "admin" });
    const productId = await seedProduct(`audit-http-${randomUUID()}`, 5, 100);
    const sale = await request(appWith({ roles: ["admin"], userId: admin.id }))
      .post("/api/v1/sales-batch")
      .send({ clientName: "Actor Http", clientId: "audit-cli-3", items: [{ productId, quantity: 1 }] });
    expect(sale.status).toBe(201);

    const { rows } = await query<{ actor_user_id: string }>(
      "SELECT actor_user_id FROM audit_logs WHERE action = 'sale.create' AND entity_id = $1",
      [sale.body.data.receipt.id as string]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe(admin.id);
  });
});

describePg("audit-logs journals — user admin and auth", () => {
  it("user approve journals user.approve with the admin actor", async () => {
    const admin = (await seedWebUser({ role: "admin" })).id;
    const user = await seedWebUser({ approve: false });
    await usersService.approveUser(user.id, { actorUserId: admin, actorRole: "administrador" });

    const { rows } = await query<{ actor_user_id: string }>(
      "SELECT actor_user_id FROM audit_logs WHERE action = 'user.approve' AND entity_id = $1",
      [user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe(admin);
  });

  it("login journals auth.login with the user as actor", async () => {
    const user = await seedWebUser({ approve: true });
    const session = await authService.login({ identifier: user.email, password: "Secreto-123!" });
    expect(session.user.id).toBe(user.id);

    const { rows } = await query<{ actor_user_id: string }>(
      "SELECT actor_user_id FROM audit_logs WHERE action = 'auth.login' AND entity_id = $1",
      [user.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_user_id).toBe(user.id);
  });

  it("auditLogsService.list returns the paged public shape", async () => {
    const action = `test.service.${randomUUID()}`;
    await auditLogsRepository.insert({ action, entityType: "test", details: {} });
    const page = await auditLogsService.list({ action, page: 1, limit: 20 });
    expect(page).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0].action).toBe(action);
  });
});
