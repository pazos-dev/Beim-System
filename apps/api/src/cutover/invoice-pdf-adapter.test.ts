import { describe, expect, it, vi } from "vitest";
import type { InvoicePdfLegacyPort } from "./invoice-pdf-adapter.js";

// Same DB-free convention as src/app.test.ts: the legacy composition builds
// the shared pool at import time, so point it at the test database BEFORE the
// dynamic imports below. This suite never issues a query.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { NotFoundError } = await import("../errors/taxonomy.js");
const { makeGetInvoicePdf, legacyInvoicePdfPort } = await import("./invoice-pdf-adapter.js");
const { receiptsService } = await import("../modules/gestion/services/receipts.js");
const { invoiceSettingsService } = await import("../modules/gestion/services/invoice-settings.js");
const { buildTicketDocument } = await import("../modules/gestion/services/ticket-document.js");
const { renderTicketPdf } = await import("../modules/gestion/services/ticket-pdf.js");

const RECEIPT = { id: "r1", receiptNumber: 42 } as never;

describe("invoice-pdf adapter (legacy-equivalent composition)", () => {
  it("composes receipt read plus settings plus document plus render in order", async () => {
    const calls: string[] = [];
    const port = {
      getReceiptById: vi.fn(async (id: string) => {
        calls.push(`get:${id}`);
        return RECEIPT;
      }),
      getSettings: vi.fn(async () => {
        calls.push("settings");
        return {};
      }),
      buildDocument: vi.fn(() => {
        calls.push("document");
        return { ticket: { number: 42 } } as never;
      }),
      renderPdf: vi.fn(async () => {
        calls.push("render");
        return Buffer.from([37, 80, 68, 70]);
      })
    } as unknown as InvoicePdfLegacyPort;
    const result = await makeGetInvoicePdf(port)("r1");
    expect(calls).toEqual(["get:r1", "settings", "document", "render"]);
    expect(result.receiptNumber).toBe(42);
    expect(result.pdf).toBeInstanceOf(Uint8Array);
  });

  it("raises NotFoundError with the legacy message on unknown ids", async () => {
    const port = {
      ...legacyInvoicePdfPort,
      getReceiptById: vi.fn(async () => null),
      getSettings: vi.fn(async () => {
        throw new Error("must not read settings on unknown receipt");
      })
    };
    await expect(makeGetInvoicePdf(port)("missing")).rejects.toEqual(
      new NotFoundError("Recibo no encontrado: missing")
    );
  });

  it("binds the legacy composition by default (no logic duplicated)", () => {
    expect(legacyInvoicePdfPort.getReceiptById).toBe(receiptsService.getById);
    expect(legacyInvoicePdfPort.getSettings).toBe(invoiceSettingsService.get);
    expect(legacyInvoicePdfPort.buildDocument).toBe(buildTicketDocument);
    expect(legacyInvoicePdfPort.renderPdf).toBe(renderTicketPdf);
  });
});
