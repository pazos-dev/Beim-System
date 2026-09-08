/**
 * Repair-status state machine tests (issue #161) — cell-phone workshop domain.
 *
 * Covers the closed transition table through createApp with the real envelope
 * contracts ({ ok:true, data } / { ok:false, error }) and the
 * NOT_FOUND_OR_FORBIDDEN auth policy (no identity → 404, unmatched role →
 * 403): forward/backward moves, terminal states, Cancelado-via-annul only,
 * idempotent same-state, forced Ingresado on creation, sales-batch Entregado,
 * and annul-after-transition. Runs against beim_api_test (see src/db/testDb.ts).
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
const { receiptsService } = await import("./services/receipts.js");
const { salesBatchService } = await import("./services/sales-batch.js");

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
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

/** Opens a repair ticket for Martín's Galaxy A54; returns its id (Ingresado). */
async function openTicket(clientName: string): Promise<string> {
  const created = await request(appWith({ roles: OPERATOR }))
    .post("/api/v1/receipts")
    .send({
      clientName,
      clientPhone: "+598 99 123 456",
      deviceBrand: "Samsung",
      deviceModel: "Galaxy A54",
      reportedIssue: "No enciende, posible placa"
    });
  expect(created.status).toBe(201);
  expect(created.body.data.repairStatus).toBe("Ingresado");
  return created.body.data.id as string;
}

async function move(id: string, status: string): Promise<request.Response> {
  return request(appWith({ roles: OPERATOR })).post(`/api/v1/receipts/${id}/status`).send({ status });
}

async function seedProduct(id: string, stock: number, price = 100): Promise<string> {
  await query(
    `INSERT INTO products (id, name, category_id, brand, model, price, currency, stock, badge, description)
     VALUES ($1, 'Taller seed', 'celulares', '', '', $3, 'UYU', $2, 'Nuevo', '')
     ON CONFLICT (id) DO UPDATE SET stock = EXCLUDED.stock, price = EXCLUDED.price, updated_at = now()`,
    [id, stock, price]
  );
  return id;
}

describePg("repair status machine: transitions", () => {
  it("walks the full forward chain Ingresado → En reparación → Listo → Entregado", async () => {
    const id = await openTicket("Martín Rodríguez");

    for (const status of ["En reparación", "Listo", "Entregado"]) {
      const res = await move(id, status);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.repairStatus).toBe(status);
    }
  });

  it("moves back En reparación → Ingresado (return to intake)", async () => {
    const id = await openTicket("Martín Reingreso");
    expect((await move(id, "En reparación")).body.data.repairStatus).toBe("En reparación");

    const back = await move(id, "Ingresado");
    expect(back.status).toBe(200);
    expect(back.body.data.repairStatus).toBe("Ingresado");
  });

  it("moves back Listo → En reparación (rework)", async () => {
    const id = await openTicket("Martín Rework");
    await move(id, "En reparación");
    await move(id, "Listo");

    const back = await move(id, "En reparación");
    expect(back.status).toBe(200);
    expect(back.body.data.repairStatus).toBe("En reparación");
  });

  it("rejects the jump Ingresado → Listo with 422 and the allowed list", async () => {
    const id = await openTicket("Martín Salto");
    const res = await move(id, "Listo");
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(res.body.error.details).toMatchObject({
      from: "Ingresado",
      to: "Listo",
      allowed: ["En reparación"]
    });
  });

  it("rejects any move out of Entregado (terminal) with 422", async () => {
    const id = await openTicket("Martín Entregado");
    await move(id, "En reparación");
    await move(id, "Listo");
    await move(id, "Entregado");

    const res = await move(id, "En reparación");
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(res.body.error.details).toMatchObject({ from: "Entregado", to: "En reparación", allowed: [] });
  });

  it("rejects Cancelado as a destination with 422 pointing at annul", async () => {
    const id = await openTicket("Martín Anulable");
    const res = await move(id, "Cancelado");
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(res.body.error.message).toMatch(/anul/i);
    expect(res.body.error.details.hint).toContain("annul");
  });

  it("same-state move is idempotent (200, no change)", async () => {
    const id = await openTicket("Martín Idempotente");
    const res = await move(id, "Ingresado");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.repairStatus).toBe("Ingresado");
  });

  it("unknown id returns 404", async () => {
    const res = await move(UNKNOWN_ID, "En reparación");
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it("status outside the enum is rejected with 422 by zod", async () => {
    const id = await openTicket("Martín Inventado");
    const res = await move(id, "Volando");
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("cliente role is forbidden (403) and the status is untouched", async () => {
    const id = await openTicket("Martín Prohibido");
    const res = await request(appWith({ roles: ["cliente"] }))
      .post(`/api/v1/receipts/${id}/status`)
      .send({ status: "En reparación" });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    const current = await receiptsService.getById(id);
    expect(current?.repairStatus).toBe("Ingresado");
  });

  it("anonymous callers see 404", async () => {
    const id = await openTicket("Martín Anónimo");
    const res = await request(appWith()).post(`/api/v1/receipts/${id}/status`).send({ status: "En reparación" });
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

describePg("repair status machine: creation + sales-batch + annul", () => {
  it("creation ignores a client-supplied status and forces Ingresado", async () => {
    const res = await request(appWith({ roles: OPERATOR }))
      .post("/api/v1/receipts")
      .send({
        clientName: "Martín Forzado",
        clientPhone: "+598 99 123 456",
        deviceBrand: "Samsung",
        deviceModel: "Galaxy A54",
        reportedIssue: "Pantalla rota",
        repairStatus: "Entregado"
      });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.repairStatus).toBe("Ingresado");
  });

  it("sales-batch receipts land directly in Entregado (service, own path)", async () => {
    const a = await seedProduct("taller-status-a", 10, 100);
    const result = await salesBatchService.run({
      clientName: "Martín Mostrador",
      clientId: "taller-cli-status-1",
      items: [{ productId: a, quantity: 1 }],
      payments: [{ method: "Efectivo", amount: 100 }]
    });
    expect(result.receipt.repairStatus).toBe("Entregado");
  });

  it("annul still works after a transition (En reparación → annul → Cancelado)", async () => {
    const id = await openTicket("Martín Garantía");
    expect((await move(id, "En reparación")).body.data.repairStatus).toBe("En reparación");

    const annul = await request(appWith({ roles: OPERATOR })).post(`/api/v1/receipts/${id}/annul`);
    expect(annul.status).toBe(200);
    expect(annul.body.ok).toBe(true);
    expect(annul.body.data.receipt.repairStatus).toBe("Cancelado");
  });
});
