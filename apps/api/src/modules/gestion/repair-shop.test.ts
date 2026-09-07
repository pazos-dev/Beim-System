/**
 * Repair-shop integration tests (gestion module) — cell-phone workshop domain.
 *
 * Covers the workshop flow end to end through createApp with the real
 * envelope contracts ({ ok:true, data } / { ok:false, error }) and the
 * NOT_FOUND_OR_FORBIDDEN auth policy (no identity → 404, unmatched role →
 * 403): client onboarding, the admin-only repair catalog (categories +
 * services) and supplier purchases, repair tickets (receipts), and counter
 * sales (sales-batch with server-side pricing). Runs against beim_api_test
 * (see src/db/testDb.ts).
 */
import type { Express } from "express";
import request from "supertest";
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

// Point the shared Pool at the test database: this suite issues queries, and
// config/db.ts builds the Pool from DATABASE_URL at module evaluation time
// (same pattern as app.test.ts). setupTestDatabase() re-asserts it.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

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
     VALUES ($1, 'Taller seed', 'celulares', '', '', $3, 'UYU', $2, 'Nuevo', '')
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price, updated_at = now()`,
    [id, stock, price]
  );
  return id;
}

describePg("repair shop: client onboarding", () => {
  it("operator creates a client (201) -> lists it -> reads it by id", async () => {
    const created = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/clients")
      .send({ name: "Martín Rodríguez", email: "martin.r@ejemplo.uy", phone: "+598 99 123 456" });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    expect(created.body.data.id).toBeTruthy();
    expect(created.body.data.name).toBe("Martín Rodríguez");
    const id: string = created.body.data.id;

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/clients").query({ active: "all" });
    expect(list.status).toBe(200);
    expect(list.body.ok).toBe(true);
    expect(list.body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/clients/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.ok).toBe(true);
    expect(byId.body.data.email).toBe("martin.r@ejemplo.uy");
  });

  it("creation without a name is rejected with 422", async () => {
    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/clients")
      .send({ email: "sin-nombre@ejemplo.uy" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("anonymous callers see 404 on client write and read", async () => {
    const post = await request(appWith())
      .post("/api/v1/clients")
      .send({ name: "Anónimo Taller", email: "anonimo@ejemplo.uy" });
    expect(post.status).toBe(404);
    expect(post.body.ok).toBe(false);

    const get = await request(appWith()).get("/api/v1/clients");
    expect(get.status).toBe(404);
    expect(get.body.ok).toBe(false);
  });

  it("cliente role is forbidden (403) from client write and read", async () => {
    const post = await request(appWith({ roles: ["cliente"] }))
      .post("/api/v1/clients")
      .send({ name: "Prohibido Taller", email: "prohibido@ejemplo.uy" });
    expect(post.status).toBe(403);
    expect(post.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const get = await request(appWith({ roles: ["cliente"] })).get("/api/v1/clients");
    expect(get.status).toBe(403);
    expect(get.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describePg("repair shop: repair catalog (admin only)", () => {
  it("admin creates the labor category; operators read it via the list", async () => {
    const created = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/categories")
      .send({ id: "mano-de-obra", name: "Mano de obra", code: "MO" });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    expect(created.body.data.id).toBe("mano-de-obra");

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/categories");
    expect(list.status).toBe(200);
    expect(list.body.ok).toBe(true);
    expect(
      list.body.data.some(
        (c: { id: string; name: string }) => c.id === "mano-de-obra" && c.name === "Mano de obra"
      )
    ).toBe(true);
  });

  it("admin creates repair services; operators list them", async () => {
    const pantalla = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/services")
      .send({ name: "Cambio de pantalla iPhone 13", data: { precioUy: 2500, duracionMin: 45 } });
    expect(pantalla.status).toBe(201);
    expect(pantalla.body.ok).toBe(true);
    const pantallaId: string = pantalla.body.data.id;

    const bateria = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/services")
      .send({ name: "Cambio de batería Galaxy A54", data: { precioUy: 1200 } });
    expect(bateria.status).toBe(201);
    const bateriaId: string = bateria.body.data.id;

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/services");
    expect(list.status).toBe(200);
    expect(list.body.ok).toBe(true);
    const ids = list.body.data.map((s: { id: string }) => s.id);
    expect(ids).toContain(pantallaId);
    expect(ids).toContain(bateriaId);
    expect(
      list.body.data.some((s: { name: string }) => s.name === "Cambio de pantalla iPhone 13")
    ).toBe(true);
  });

  it("operators are forbidden (403) from creating services and categories", async () => {
    const service = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/services")
      .send({ name: "Servicio prohibido" });
    expect(service.status).toBe(403);
    expect(service.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const category = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/categories")
      .send({ id: "prohibida", name: "Prohibida", code: "PRH" });
    expect(category.status).toBe(403);
  });

  it("anonymous callers see 404 on catalog writes", async () => {
    const service = await request(appWith())
      .post("/api/v1/services")
      .send({ name: "Servicio anónimo" });
    expect(service.status).toBe(404);

    const category = await request(appWith())
      .post("/api/v1/categories")
      .send({ id: "anonima", name: "Anónima", code: "ANO" });
    expect(category.status).toBe(404);
  });
});

describePg("repair shop: supplier purchase (admin only)", () => {
  it("admin records a purchase; operators list it", async () => {
    const created = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/purchases")
      .send({ supplierName: "Distribuidora del Este", data: { rubro: "repuestos" } });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    expect(created.body.data.supplierName).toBe("Distribuidora del Este");
    const id: string = created.body.data.id;

    const list = await request(appWith({ roles: OPERATOR })).get("/api/v1/purchases");
    expect(list.status).toBe(200);
    expect(list.body.ok).toBe(true);
    expect(
      list.body.data.some(
        (p: { id: string; supplierName: string }) =>
          p.id === id && p.supplierName === "Distribuidora del Este"
      )
    ).toBe(true);
  });

  it("operators are forbidden (403) from recording purchases", async () => {
    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/purchases")
      .send({ supplierName: "Proveedor prohibido" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describePg("repair shop: repair ticket (receipt)", () => {
  it("operator opens a repair ticket (201) -> reads it by id -> finds it by client", async () => {
    const created = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/receipts")
      .send({
        clientName: "Martín Rodríguez",
        clientPhone: "+598 99 123 456",
        deviceBrand: "Samsung",
        deviceModel: "Galaxy A54",
        imeiSerial: "356938035643809",
        reportedIssue: "No enciende, posible placa"
      });
    expect(created.status).toBe(201);
    expect(created.body.ok).toBe(true);
    expect(created.body.data.id).toBeTruthy();
    expect(created.body.data.repairStatus).toBe("Ingresado");
    const id: string = created.body.data.id;

    const byId = await request(appWith({ roles: OPERATOR })).get(`/api/v1/receipts/${id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.ok).toBe(true);
    expect(byId.body.data.deviceModel).toBe("Galaxy A54");

    const byClient = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/receipts")
      .query({ client: "Martín" });
    expect(byClient.status).toBe(200);
    expect(byClient.body.ok).toBe(true);
    expect(byClient.body.data.total).toBeGreaterThanOrEqual(1);
    expect(byClient.body.data.items.map((r: { id: string }) => r.id)).toContain(id);
  });

  it("operator reads the financial state (200)", async () => {
    const res = await request(appWith({ roles: OPERATOR })).get("/api/v1/financial-state");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeTruthy();
  });
});

describePg("repair shop: counter sale (sales-batch)", () => {
  it("operator sells a fast charger with server-side pricing (total 1120)", async () => {
    await seedProduct("cargador-rapido", 30, 1120);

    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({
        clientName: "Martín Rodríguez",
        clientId: "taller-cli-1",
        clientPhone: "+598 99 123 456",
        deviceModel: "iPhone 13",
        reportedIssue: "Pantalla rota",
        items: [{ productId: "cargador-rapido", quantity: 1 }],
        payments: [{ method: "efectivo", amount: 1120 }]
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.total).toBe(1120);
    expect(res.body.data.items).toEqual([{ productId: "cargador-rapido", quantity: 1, unitPrice: 1120 }]);
    const receiptId: string = res.body.data.receipt.id;

    const byClient = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/receipts")
      .query({ client: "Martín" });
    expect(byClient.status).toBe(200);
    expect(byClient.body.data.items.map((r: { id: string }) => r.id)).toContain(receiptId);

    // The batch itself journals no stock.movement event, so the counter records
    // the outbound movement explicitly and then lists it.
    const recorded = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/stock-movements")
      .send({
        productId: "cargador-rapido",
        movementType: "salida",
        quantity: 1,
        detail: "Venta mostrador taller"
      });
    expect(recorded.status).toBe(201);

    const movements = await request(appWith({ roles: OPERATOR }))
      .get("/api/v1/stock-movements")
      .query({ productId: "cargador-rapido" });
    expect(movements.status).toBe(200);
    expect(movements.body.ok).toBe(true);
    expect(
      movements.body.data.some(
        (m: { productId: string; movementType: string }) =>
          m.productId === "cargador-rapido" && m.movementType === "salida"
      )
    ).toBe(true);
  });

  it("requesting 9999 units aborts with 409 and the anonymous caller sees 404", async () => {
    const conflict = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/sales-batch")
      .send({
        clientName: "Martín Rodríguez",
        clientId: "taller-cli-1",
        items: [{ productId: "cargador-rapido", quantity: 9999 }]
      });
    expect(conflict.status).toBe(409);
    expect(conflict.body.ok).toBe(false);
    expect(conflict.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const anon = await request(appWith())
      .post("/api/v1/sales-batch")
      .send({
        clientName: "Martín Rodríguez",
        clientId: "taller-cli-1",
        items: [{ productId: "cargador-rapido", quantity: 1 }]
      });
    expect(anon.status).toBe(404);
    expect(anon.body.ok).toBe(false);
  });
});
