import { describe, expect, it } from "vitest";

import { ConflictError, ValidationError } from "../../errors/taxonomy.js";
import { mintPago } from "./pago.js";
import {
  commitPaidVenta,
  ingestWebhookEvent,
  type WebhookEvent
} from "./webhook-event.js";

const PRICED_VENTA = {
  id: "v-1",
  total: { amount: 1500, currency: "UYU" as const }
};

function received(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    provider: "mercadopago",
    eventId: "evt-1",
    orderId: null,
    outcome: "received",
    receivedAt: new Date("2026-09-09T10:00:00Z"),
    ...overrides
  };
}

describe("Pago aggregate (domain slice)", () => {
  it("mints a fresh preference overwriting any stored id", () => {
    const pago = mintPago(PRICED_VENTA, "pref-fresh");
    expect(pago.orderId).toBe("v-1");
    expect(pago.preferenceId).toBe("pref-fresh");
    expect(pago.paymentId).toBeNull();
    expect(pago.paidAt).toBeNull();
    expect(pago.total).toEqual({ amount: 1500, currency: "UYU" });
  });

  it("rejects mint for an unpriced venta and an empty preference with 422", () => {
    expect(() => mintPago({ id: "v-1", total: null }, "pref-1")).toThrow(ValidationError);
    expect(() => mintPago(PRICED_VENTA, "  ")).toThrow(ValidationError);
  });

  it("ingests a first delivery as received", () => {
    const event = ingestWebhookEvent(null, {
      provider: "mercadopago",
      eventId: "evt-1",
      receivedAt: new Date("2026-09-09T10:00:00Z")
    });
    expect(event.outcome).toBe("received");
    expect(event.orderId).toBeNull();
  });

  it("dedupes a duplicate delivery keeping the sale untouched", () => {
    const first = received({ orderId: "v-1" });
    const second = ingestWebhookEvent(first, {
      provider: "mercadopago",
      eventId: "evt-1",
      receivedAt: new Date("2026-09-09T10:05:00Z")
    });
    expect(second.outcome).toBe("deduped");
    expect(second.orderId).toBe("v-1");
    expect(second.receivedAt).toEqual(first.receivedAt);
  });

  it("rejects ingest with empty provider or event id with 422", () => {
    const at = new Date("2026-09-09T10:00:00Z");
    expect(() => ingestWebhookEvent(null, { provider: "  ", eventId: "e", receivedAt: at }))
      .toThrow(ValidationError);
    expect(() => ingestWebhookEvent(null, { provider: "mp", eventId: "", receivedAt: at }))
      .toThrow(ValidationError);
  });

  it("commits an approved delivery as paid linking order and payment", () => {
    const result = commitPaidVenta(received(), {
      orderId: "v-1",
      approved: true,
      oversell: false,
      paymentId: "pay-1",
      paidAt: new Date("2026-09-09T10:01:00Z")
    });
    expect(result.event.outcome).toBe("paid");
    expect(result.event.orderId).toBe("v-1");
    expect(result.sale?.paymentId).toBe("pay-1");
    expect(result.sale?.stockCommitted).toBe(true);
  });

  it("keeps an oversold sale paid with stock_committed=false", () => {
    const result = commitPaidVenta(received(), {
      orderId: "v-1",
      approved: true,
      oversell: true,
      paymentId: "pay-1",
      paidAt: new Date("2026-09-09T10:01:00Z")
    });
    expect(result.event.outcome).toBe("paid_oversell");
    expect(result.sale?.stockCommitted).toBe(false);
  });

  it("leaves the sale untouched when the payment is not approved", () => {
    const result = commitPaidVenta(received(), {
      orderId: "v-1",
      approved: false,
      oversell: false,
      paymentId: "pay-1",
      paidAt: new Date("2026-09-09T10:01:00Z")
    });
    expect(result.event.outcome).toBe("not_approved");
    expect(result.sale).toBeNull();
  });

  it("rejects a second commit with 409 keeping the first outcome", () => {
    const event = received({ outcome: "paid", orderId: "v-1" });
    expect(() =>
      commitPaidVenta(event, {
        orderId: "v-1",
        approved: true,
        oversell: false,
        paymentId: "pay-2",
        paidAt: new Date("2026-09-09T10:02:00Z")
      })
    ).toThrow(ConflictError);
  });
});
