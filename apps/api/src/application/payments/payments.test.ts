import { describe, expect, it } from "vitest";

import type {
  Clock,
  PaymentGatewayPort,
  TxClient,
  UnitOfWork,
  WebhookVerifierPort
} from "../../domain/shared/ports.js";
import {
  AuthError,
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
  ValidationError
} from "../../domain/shared/errors.js";
import { createVenta, type Venta } from "../../domain/venta/venta.js";
import type { Pago } from "../../domain/pago/pago.js";
import type { WebhookEvent } from "../../domain/pago/webhook-event.js";
import { makePaymentHandlers } from "./payments.js";
import type { PaymentPagoStore, PaymentVentaStore, PaymentWebhookStore } from "./ports.js";

class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;
  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeVentaStore implements PaymentVentaStore {
  ventas = new Map<string, Venta>();
  saves = 0;
  async findById(_tx: TxClient, id: string): Promise<Venta | null> {
    return this.ventas.get(id) ?? null;
  }
  async save(_tx: TxClient, venta: Venta): Promise<void> {
    this.saves += 1;
    this.ventas.set(venta.id, venta);
  }
}

class FakePagoStore implements PaymentPagoStore {
  pagos = new Map<string, Pago>();
  saves = 0;
  async save(_tx: TxClient, pago: Pago): Promise<void> {
    this.saves += 1;
    this.pagos.set(pago.orderId, pago);
  }
}

class FakeWebhookStore implements PaymentWebhookStore {
  events = new Map<string, WebhookEvent>();
  saves = 0;
  private key(provider: string, eventId: string): string {
    return `${provider}:${eventId}`;
  }
  async findByKey(_tx: TxClient, provider: string, eventId: string): Promise<WebhookEvent | null> {
    return this.events.get(this.key(provider, eventId)) ?? null;
  }
  async save(_tx: TxClient, event: WebhookEvent): Promise<void> {
    this.saves += 1;
    this.events.set(this.key(event.provider, event.eventId), event);
  }
}

class FakeGateway implements PaymentGatewayPort {
  calls = 0;
  nextId = "pref-fresh";
  fail503 = false;
  async createPreference(_orderId: string, _amount: number): Promise<{ preferenceId: string }> {
    this.calls += 1;
    if (this.fail503) throw new DependencyUnavailableError();
    return { preferenceId: this.nextId };
  }
}

class FakeVerifier implements WebhookVerifierPort {
  valid = true;
  fail503 = false;
  verify(_rawBody: Uint8Array, _signature: string): boolean {
    if (this.fail503) throw new DependencyUnavailableError();
    return this.valid;
  }
}

const FIXED_NOW = new Date("2026-09-09T10:00:00.000Z");
const clock: Clock = { now: () => new Date(FIXED_NOW) };

function setup() {
  const uow = new FakeUnitOfWork();
  const ventas = new FakeVentaStore();
  const pagos = new FakePagoStore();
  const webhooks = new FakeWebhookStore();
  const gateway = new FakeGateway();
  const verifier = new FakeVerifier();
  return { uow, ventas, pagos, webhooks, gateway, verifier, handler: makePaymentHandlers({ uow, ventas, pagos, webhooks, gateway, verifier, clock }) };
}

function seedPending(store: FakeVentaStore, id = "v-1"): void {
  const venta = createVenta({ id, channel: "webshop", lines: [{ productId: null, quantity: 1 }] });
  store.ventas.set(id, { ...venta, total: { amount: 1500, currency: "UYU" as const } });
}

function body(): Uint8Array {
  return new TextEncoder().encode('{"id":"evt-1"}');
}

function webhookInput(orderId = "v-1", eventId = "evt-1", paymentId = "pay-1") {
  return { provider: "mercadopago", eventId, rawBody: body(), signature: "sig-ok", orderId, approved: true, oversell: false, paymentId } as const;
}

describe("Payment handlers (application slice)", () => {
  it("mints a fresh preference overwriting any stored id, one run one save", async () => {
    const s = setup();
    seedPending(s.ventas);
    s.gateway.nextId = "pref-fresh";
    const pago = await s.handler.mintPreference({ orderId: "v-1" });
    expect(pago.preferenceId).toBe("pref-fresh");
    expect(pago.paymentId).toBeNull();
    expect(s.uow.runs).toBe(1);
    expect(s.pagos.saves).toBe(1);
    s.gateway.nextId = "pref-fresh-2";
    await s.handler.mintPreference({ orderId: "v-1" });
    expect(s.pagos.pagos.get("v-1")?.preferenceId).toBe("pref-fresh-2");
  });

  it("rejects mint for missing, non-pending, or unpriced ventas with zero gateway calls", async () => {
    const { ventas, pagos, gateway, handler } = setup();
    await expect(handler.mintPreference({ orderId: "missing" })).rejects.toThrow(NotFoundError);
    seedPending(ventas, "v-paid");
    ventas.ventas.set("v-paid", { ...ventas.ventas.get("v-paid")!, status: "Pagada", paymentRef: "pay-1", paidAt: FIXED_NOW });
    await expect(handler.mintPreference({ orderId: "v-paid" })).rejects.toThrow(ConflictError);
    ventas.ventas.set("v-raw", createVenta({ id: "v-raw", channel: "webshop", lines: [{ productId: null, quantity: 1 }] }));
    await expect(handler.mintPreference({ orderId: "v-raw" })).rejects.toThrow(ValidationError);
    expect(pagos.saves).toBe(0);
    expect(gateway.calls).toBe(0);
  });

  it("passes gateway 503 through on mint with zero saves", async () => {
    const { ventas, pagos, gateway, handler } = setup();
    seedPending(ventas);
    gateway.fail503 = true;
    await expect(handler.mintPreference({ orderId: "v-1" })).rejects.toThrow(DependencyUnavailableError);
    expect(pagos.saves).toBe(0);
  });

  it("commits approved delivery as paid marking the venta Pagada in one run", async () => {
    const { uow, ventas, webhooks, handler } = setup();
    seedPending(ventas);
    const result = await handler.handleWebhook({ ...webhookInput() });
    expect(result).toEqual({ outcome: "paid", orderId: "v-1" });
    expect(uow.runs).toBe(1);
    expect(webhooks.saves).toBe(1);
    expect(ventas.saves).toBe(1);
    expect(ventas.ventas.get("v-1")).toMatchObject({ status: "Pagada", paymentRef: "pay-1" });
  });

  it("dedupes a duplicate delivery keeping the sale untouched with zero saves", async () => {
    const { uow, ventas, webhooks, handler } = setup();
    seedPending(ventas);
    await handler.handleWebhook({ ...webhookInput() });
    const result = await handler.handleWebhook({ ...webhookInput() });
    expect(result.outcome).toBe("deduped");
    expect(webhooks.saves).toBe(1);
    expect(ventas.saves).toBe(1);
    expect(uow.runs).toBe(2);
  });

  it("keeps an oversold sale paid and leaves not_approved untouched", async () => {
    const over = setup();
    seedPending(over.ventas);
    const paid = await over.handler.handleWebhook({ ...webhookInput("v-1", "evt-over", "pay-9"), oversell: true });
    expect(paid.outcome).toBe("paid_oversell");
    expect(over.ventas.ventas.get("v-1")).toMatchObject({ status: "Pagada", stockCommitted: false });
    const na = setup();
    seedPending(na.ventas);
    const result = await na.handler.handleWebhook({ ...webhookInput("v-1", "evt-na", "pay-2"), approved: false });
    expect(result.outcome).toBe("not_approved");
    expect(na.ventas.saves).toBe(0);
    expect(na.ventas.ventas.get("v-1")?.status).toBe("Pendiente");
  });

  it("rejects bad signatures with 403 and unavailable verification with 503, zero saves", async () => {
    const { ventas, webhooks, verifier, handler } = setup();
    seedPending(ventas);
    verifier.valid = false;
    await expect(handler.handleWebhook({ ...webhookInput("v-1", "evt-403") })).rejects.toThrow(AuthError);
    verifier.valid = true;
    verifier.fail503 = true;
    await expect(handler.handleWebhook({ ...webhookInput("v-1", "evt-503") })).rejects.toThrow(DependencyUnavailableError);
    expect(webhooks.saves).toBe(0);
    expect(ventas.saves).toBe(0);
  });
});
