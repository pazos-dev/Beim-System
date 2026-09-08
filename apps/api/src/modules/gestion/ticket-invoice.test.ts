/**
 * Internal ticket PDF tests (issue #167) — cell-phone workshop domain.
 *
 * Template settings (operator read, principal-only write) plus the PDF
 * download of a real receipt through createApp with the envelope contracts
 * and the NOT_FOUND_OR_FORBIDDEN auth policy (no identity → 404, unmatched
 * role → 403). Runs against beim_api_test (see src/db/testDb.ts).
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
const { receiptsService } = await import("./services/receipts.js");
const { buildTicketDocument } = await import("./services/ticket-document.js");

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
const PRINCIPAL = ["administrador_principal"];
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

const TEMPLATE = {
  business: { name: "Taller Beim", address: "Av. 18 de Julio 1234", phone: "099 123 456" },
  policies: "Se entrega solo con este ticket",
  warranty: "30 días de garantía por mano de obra",
  footer: "Gracias por su visita",
  customSections: [{ id: "horarios", title: "Horarios", body: "Lun a Vie 9–18" }]
};

/** Opens a repair ticket for Lucía's Moto G84; returns its id (Ingresado). */
async function openTicket(clientName: string): Promise<string> {
  const created = await request(appWith({ roles: OPERATOR }))
    .post("/api/v1/receipts")
    .send({
      clientName,
      clientPhone: "+598 99 654 321",
      deviceBrand: "Motorola",
      deviceModel: "Moto G84",
      reportedIssue: "Pin de carga flojo",
      price: "2800"
    });
  expect(created.status).toBe(201);
  return created.body.data.id as string;
}

/** PDF bytes out of a supertest response (binary body or encoded text). */
function pdfBytes(res: request.Response): Buffer {
  if (Buffer.isBuffer(res.body) && res.body.length > 0) return res.body;
  return Buffer.from(res.text ?? "", "binary");
}

describePg("ticket template settings", () => {
  it("principal saves the template (200) and the operator reads it back", async () => {
    const saved = await request(appWith({ roles: PRINCIPAL })).put("/api/v1/invoice-settings").send(TEMPLATE);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ ok: true, data: { warranty: TEMPLATE.warranty } });

    const read = await request(appWith({ roles: OPERATOR })).get("/api/v1/invoice-settings");
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ ok: true, data: { warranty: TEMPLATE.warranty, footer: TEMPLATE.footer } });
  });

  it("administrador (not principal) cannot save the template (403)", async () => {
    const res = await request(appWith({ roles: ADMIN })).put("/api/v1/invoice-settings").send(TEMPLATE);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("cliente cannot read the template (403)", async () => {
    const res = await request(appWith({ roles: ["cliente"] })).get("/api/v1/invoice-settings");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("anonymous callers see 404 on both settings routes", async () => {
    expect((await request(appWith()).get("/api/v1/invoice-settings")).status).toBe(404);
    expect((await request(appWith()).put("/api/v1/invoice-settings").send(TEMPLATE)).status).toBe(404);
  });

  it("rejects unknown keys with 422 (strict boundary)", async () => {
    const res = await request(appWith({ roles: PRINCIPAL }))
      .put("/api/v1/invoice-settings")
      .send({ ...TEMPLATE, taxId: "21 123456 0012" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describePg("ticket pdf download", () => {
  it("serves a real receipt as inline PDF bytes starting with %PDF-", async () => {
    const id = await openTicket("Lucía Fernández");

    const res = await request(appWith({ roles: OPERATOR })).get(`/api/v1/receipts/${id}/invoice`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toContain("inline");
    expect(pdfBytes(res).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("reflects a warranty change through the builder (no PDF parsing)", async () => {
    const id = await openTicket("Diego Sosa");
    const warranty = "Garantía extendida de 90 días por placa";

    const saved = await request(appWith({ roles: PRINCIPAL }))
      .put("/api/v1/invoice-settings")
      .send({ warranty });
    expect(saved.status).toBe(200);

    const stored = await request(appWith({ roles: OPERATOR })).get("/api/v1/invoice-settings");
    const receipt = await receiptsService.getById(id);
    expect(receipt).not.toBeNull();
    const doc = buildTicketDocument(receipt!, stored.body.data);
    expect(doc.sections).toEqual([{ id: "warranty", title: "Garantía", body: warranty }]);
  });

  it("unknown receipt id returns 404", async () => {
    const res = await request(appWith({ roles: OPERATOR })).get(`/api/v1/receipts/${UNKNOWN_ID}/invoice`);
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  it("cliente role is forbidden (403)", async () => {
    const id = await openTicket("Ana Prohibida");
    const res = await request(appWith({ roles: ["cliente"] })).get(`/api/v1/receipts/${id}/invoice`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("anonymous callers see 404", async () => {
    const id = await openTicket("Pedro Anónimo");
    const res = await request(appWith()).get(`/api/v1/receipts/${id}/invoice`);
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});
