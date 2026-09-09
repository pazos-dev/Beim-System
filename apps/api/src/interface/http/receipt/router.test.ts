import express from "express";
import request from "supertest";
import { describe, expect, it, vi, type Mock } from "vitest";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES, NotFoundError } from "../../../errors/taxonomy.js";
import { renderError } from "../errorHandler.js";
import { createReceiptRouter, type ReceiptRouterDeps } from "./router.js";

const RECEIPT_ID = "11111111-1111-4111-8111-111111111111";
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

const VALID_CREATE = {
  clientName: "Lucía Fernández",
  clientPhone: "+598 99 654 321",
  deviceBrand: "Motorola",
  deviceModel: "Moto G84",
  reportedIssue: "Pin de carga flojo",
  price: "2800"
};

const PDF_BYTES = Buffer.from("%PDF-1.4 fake-ticket-bytes");
const RECEIPT_NUMBER = 42;

type MockDeps = ReceiptRouterDeps & {
  nextNumber: Mock;
  listReceipts: Mock;
  createReceipt: Mock;
  getReceiptById: Mock;
  annulReceipt: Mock;
  transitionRepairStatus: Mock;
  getInvoicePdf: Mock;
};

/** Canned handler results: shape is opaque to the router (envelope only). */
function okDeps(): MockDeps {
  const receipt = { id: RECEIPT_ID, receiptNumber: RECEIPT_NUMBER };
  return {
    nextNumber: vi.fn(async () => RECEIPT_NUMBER),
    listReceipts: vi.fn(async () => ({ items: [receipt], page: 1, limit: 20, total: 1 })),
    createReceipt: vi.fn(async () => receipt),
    getReceiptById: vi.fn(async () => receipt),
    annulReceipt: vi.fn(async () => ({ receipt, restoredItems: [], reversedMovements: [] })),
    transitionRepairStatus: vi.fn(async () => receipt),
    getInvoicePdf: vi.fn(async () => ({ pdf: PDF_BYTES, receiptNumber: RECEIPT_NUMBER }))
  };
}

function buildApp(deps: ReceiptRouterDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use(createReceiptRouter(deps));
  return app;
}

/** PDF bytes out of a supertest response (binary body or encoded text). */
function pdfBytes(res: request.Response): Buffer {
  if (Buffer.isBuffer(res.body) && res.body.length > 0) return res.body;
  return Buffer.from(res.text ?? "", "binary");
}

describe("receipt thin router (validate-handler-envelope only)", () => {
  it("returns the next receipt number with the frozen success envelope", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).get("/receipts/next-number");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, data: { receiptNumber: RECEIPT_NUMBER } });
    expect(deps.nextNumber).toHaveBeenCalledTimes(1);
  });

  it("lists receipts forwarding the validated query", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).get("/receipts").query({ client: "Lucía" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deps.listReceipts).toHaveBeenCalledWith(expect.objectContaining({ client: "Lucía" }));
  });

  it("creates a receipt with 201 and the frozen success envelope", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/receipts").send(VALID_CREATE);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, data: await deps.createReceipt.mock.results[0].value });
    expect(deps.createReceipt).toHaveBeenCalledWith(VALID_CREATE);
  });

  it("reads a receipt by id with 200", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).get(`/receipts/${RECEIPT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deps.getReceiptById).toHaveBeenCalledWith(RECEIPT_ID);
  });

  it("maps an unknown receipt id to 404 with the frozen envelope", async () => {
    const deps = okDeps();
    deps.getReceiptById.mockResolvedValueOnce(null);
    const res = await request(buildApp(deps)).get(`/receipts/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(renderError(new NotFoundError(`Recibo no encontrado: ${UNKNOWN_ID}`)).body);
  });

  it("serves the ticket PDF inline with byte-identical body", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).get(`/receipts/${RECEIPT_ID}/invoice`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe(`inline; filename="ticket-${RECEIPT_NUMBER}.pdf"`);
    expect(Buffer.compare(pdfBytes(res), PDF_BYTES)).toBe(0);
    expect(deps.getInvoicePdf).toHaveBeenCalledWith(RECEIPT_ID);
  });

  it("maps an unknown invoice id to 404 without PDF headers", async () => {
    const deps = okDeps();
    deps.getInvoicePdf.mockRejectedValueOnce(new NotFoundError(`Recibo no encontrado: ${UNKNOWN_ID}`));
    const res = await request(buildApp(deps)).get(`/receipts/${UNKNOWN_ID}/invoice`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(renderError(new NotFoundError(`Recibo no encontrado: ${UNKNOWN_ID}`)).body);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("annuls a receipt forwarding the audit actor", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post(`/receipts/${RECEIPT_ID}/annul`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deps.annulReceipt).toHaveBeenCalledWith(RECEIPT_ID, { actorUserId: null, actorRole: null });
  });

  it("transitions the repair status forwarding id, status and actor", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post(`/receipts/${RECEIPT_ID}/status`).send({ status: "Listo" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(deps.transitionRepairStatus).toHaveBeenCalledWith(RECEIPT_ID, "Listo", {
      actorUserId: null,
      actorRole: null
    });
  });

  it("rejects unknown body keys with 422 before any handler runs", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post("/receipts").send({ ...VALID_CREATE, unknown: "x" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(deps.createReceipt).not.toHaveBeenCalled();
  });

  it("rejects non-uuid ids with 422 before any handler runs", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).get("/receipts/not-a-uuid");
    expect(res.status).toBe(422);
    expect(deps.getReceiptById).not.toHaveBeenCalled();
  });

  it("rejects an out-of-enum repair status with 422", async () => {
    const deps = okDeps();
    const res = await request(buildApp(deps)).post(`/receipts/${RECEIPT_ID}/status`).send({ status: "Quemado" });
    expect(res.status).toBe(422);
    expect(deps.transitionRepairStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", "Autenticación requerida", ERROR_CODES.AUTHENTICATION_REQUIRED, 401],
    ["FORBIDDEN", "No tiene permisos para realizar esta operación", ERROR_CODES.FORBIDDEN, 403],
    ["NOT_FOUND_OR_FORBIDDEN", "Recurso no encontrado", ERROR_CODES.NOT_FOUND_OR_FORBIDDEN, 404]
  ] as const)("renders %s as %i with the frozen envelope", async (code, message, statusCode, expected) => {
    const deps = okDeps();
    deps.listReceipts.mockRejectedValueOnce(new AppError(code, message, statusCode));
    const res = await request(buildApp(deps)).get("/receipts");
    const baseline = renderError(new AppError(code, message, statusCode));
    expect(res.status).toBe(expected);
    expect(res.body).toEqual(baseline.body);
  });

  it("renders unknown handler failures as 500 without leaking the cause", async () => {
    const deps = okDeps();
    deps.createReceipt.mockRejectedValueOnce(new Error("secreto pg://internal"));
    const res = await request(buildApp(deps)).post("/receipts").send(VALID_CREATE);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" }
    });
    expect(JSON.stringify(res.body)).not.toContain("secreto");
  });
});
