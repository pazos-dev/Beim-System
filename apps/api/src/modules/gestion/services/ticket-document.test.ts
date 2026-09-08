/**
 * Ticket document builder unit tests (issue #167) — cell-phone workshop domain.
 *
 * Pure and DB-free: buildTicketDocument maps a receipt + template settings to
 * the plain document without touching Postgres or the PDF renderer.
 */
import { describe, expect, it } from "vitest";
import type { BeimReceipt } from "../ports.js";
import type { InvoiceSettings } from "../schemas.js";
import { NON_FISCAL_TEXT, buildTicketDocument } from "./ticket-document.js";

const BASE_RECEIPT: BeimReceipt = {
  id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5",
  receiptNumber: 1042,
  clientName: "Martín Rodríguez",
  clientId: "095123456",
  clientPhone: "099 123 456",
  deviceBrand: "Samsung",
  deviceModel: "Galaxy A54",
  deviceColor: "Negro",
  imeiSerial: "350123456789012",
  reportedIssue: "No enciende, posible placa",
  services: ["Diagnóstico", "Cambio de placa"],
  price: "3200",
  repairStatus: "En reparación",
  quoteStatus: "Borrador",
  quoteTotal: 3200,
  paymentStatus: "Pendiente",
  payload: {},
  createdAt: new Date("2026-09-01T10:00:00.000Z"),
  updatedAt: new Date("2026-09-02T10:00:00.000Z")
};

function saleReceipt(): BeimReceipt {
  return {
    ...BASE_RECEIPT,
    repairStatus: "Entregado",
    price: "6500",
    quoteTotal: 6500,
    payload: {
      sale: true,
      total: 6500,
      items: [
        { productId: "pantalla-iphone-13", quantity: 1, unitPrice: 4500 },
        { productId: "mano-de-obra", quantity: 1, unitPrice: 2000 }
      ]
    }
  };
}

describe("buildTicketDocument", () => {
  it("maps header, ticket, client, device and status from the receipt", () => {
    const settings: InvoiceSettings = {
      business: { name: "Taller Beim", address: "Av. 18 de Julio 1234", phone: "099 123 456", rut: "21 123456 0012" }
    };
    const doc = buildTicketDocument(BASE_RECEIPT, settings);

    expect(doc.header).toEqual({
      name: "Taller Beim",
      address: "Av. 18 de Julio 1234",
      phone: "099 123 456",
      rut: "21 123456 0012"
    });
    expect(doc.ticket.number).toBe(1042);
    expect(doc.ticket.status).toBe("En reparación");
    expect(doc.ticket.client.name).toBe("Martín Rodríguez");
    expect(doc.ticket.device).toMatchObject({ brand: "Samsung", model: "Galaxy A54" });
    expect(doc.ticket.imei).toBe("350123456789012");
    expect(doc.ticket.issue).toBe("No enciende, posible placa");
  });

  it("derives lines from payload items with total = sum of lines", () => {
    const doc = buildTicketDocument(saleReceipt(), {});

    expect(doc.lines).toEqual([
      { description: "pantalla-iphone-13", quantity: 1, unitPrice: 4500, amount: 4500 },
      { description: "mano-de-obra", quantity: 1, unitPrice: 2000, amount: 2000 }
    ]);
    expect(doc.total).toBe(6500);
  });

  it("falls back to a single line from the receipt total for plain intakes", () => {
    const doc = buildTicketDocument(BASE_RECEIPT, {});

    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].unitPrice).toBe(3200);
    expect(doc.total).toBe(3200);
    expect(doc.total).toBe(doc.lines.reduce((sum, line) => sum + line.amount, 0));
  });

  it("omits the warranty section when absent, keeps it when present", () => {
    expect(buildTicketDocument(BASE_RECEIPT, {}).sections).toEqual([]);

    const doc = buildTicketDocument(BASE_RECEIPT, { warranty: "30 días por mano de obra" });
    expect(doc.sections).toEqual([{ id: "warranty", title: "Garantía", body: "30 días por mano de obra" }]);
  });

  it("orders sections as custom (stored order) + policies + warranty + footer", () => {
    const doc = buildTicketDocument(BASE_RECEIPT, {
      footer: "Gracias por su visita",
      warranty: "30 días por mano de obra",
      policies: "Se entrega solo con este ticket",
      customSections: [
        { id: "horarios", title: "Horarios", body: "Lun a Vie 9–18" },
        { id: "retiro", title: "Retiro", body: "Plazo de 30 días" }
      ]
    });

    expect(doc.sections.map((section) => section.id)).toEqual([
      "horarios",
      "retiro",
      "policies",
      "warranty",
      "footer"
    ]);
  });

  it("marks every ticket as non-fiscal with the fixed notice", () => {
    const doc = buildTicketDocument(BASE_RECEIPT, {});

    expect(doc.nonFiscal).toBe(true);
    expect(doc.nonFiscalText).toBe(NON_FISCAL_TEXT);
    expect(doc.nonFiscalText).toBe("Ticket interno del taller — no válido como comprobante fiscal");
  });

  it("carries no tax breakdown anywhere in the document", () => {
    const doc = buildTicketDocument(saleReceipt(), {
      business: { name: "Taller Beim" },
      policies: "Se entrega solo con este ticket",
      warranty: "30 días por mano de obra",
      footer: "Gracias por su visita",
      customSections: [{ id: "horarios", title: "Horarios", body: "Lun a Vie 9–18" }]
    });

    expect(JSON.stringify(doc)).not.toMatch(/iva/i);
  });
});
