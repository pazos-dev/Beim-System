/**
 * Pago/Webhook adapters (slice 3.3, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests + SQL-text asserts. Preference overwrite reuses
 * the legacy `pg-payments.ts` setPreferenceId UPDATE byte-identical;
 * `save(received)` claims with the legacy claimEvent INSERT
 * (`ON CONFLICT DO NOTHING`, first-insert-wins) and any other outcome
 * advances with the legacy markEvent UPDATE — the outcome discriminates
 * claim from advance exactly like the application ingest→commit flow.
 * `findByKey` is new (no legacy counterpart — additive read-only DELTA).
 * Approved-only moves and oversell `stockCommitted=false` live in the
 * domain (`commitPaidVenta`); the paid flip on `orders` itself is owned by
 * the pending Venta adapter (slice 3.1), NOT here.
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { TxClient } from "../../domain/shared/ports.js";
import { mintPago } from "../../domain/pago/pago.js";
import { commitPaidVenta, ingestWebhookEvent } from "../../domain/pago/webhook-event.js";

// Dynamic imports AFTER the DATABASE_URL guard (see pg-cash.test.ts).
const { PgPagoAdapter, PgWebhookAdapter } = await import("./pg-pago.adapter.js");
const { toDomainWebhookEvent } = await import("./pg-pago.mapper.js");

/** Legacy setPreferenceId text, copied verbatim from pg-payments.ts. */
const LEGACY_PREFERENCE = "UPDATE orders SET mp_preference_id = $2 WHERE id = $1";

/** Legacy claimEvent text, copied verbatim from pg-payments.ts. */
const LEGACY_CLAIM = `INSERT INTO webhook_events (provider, event_id, status)
         VALUES ($1, $2, 'received')
         ON CONFLICT DO NOTHING`;

/** Legacy markEvent text, copied verbatim from pg-payments.ts. */
const LEGACY_ADVANCE = `UPDATE webhook_events SET status = $3, order_id = $4
         WHERE provider = $1 AND event_id = $2`;

function stubTx(captured: Array<{ text: string; params: unknown[] }>, queued: unknown[][]): TxClient {
  const tx = {
    query: async (text: string, params: unknown[]) => {
      captured.push({ text, params });
      return { rows: queued.shift() ?? [] };
    }
  } as unknown as PoolClient;
  return tx as unknown as TxClient;
}

function eventRow() {
  return {
    provider: "mercadopago",
    event_id: "evt-1",
    order_id: "order-1",
    status: "paid_oversell",
    received_at: new Date("2026-09-09T10:00:00.000Z")
  };
}

describe("webhook mapper", () => {
  it("maps a ledger row to exactly the WebhookEvent shape", () => {
    expect(toDomainWebhookEvent(eventRow())).toEqual({
      provider: "mercadopago",
      eventId: "evt-1",
      orderId: "order-1",
      outcome: "paid_oversell",
      receivedAt: new Date("2026-09-09T10:00:00.000Z")
    });
  });

  it("keeps a null order link on fresh deliveries", () => {
    expect(toDomainWebhookEvent({ ...eventRow(), order_id: null, status: "received" }).orderId).toBeNull();
  });

  it("rejects unknown ledger statuses fail-closed", () => {
    expect(() => toDomainWebhookEvent({ ...eventRow(), status: "refunded" })).toThrow();
  });
});

describe("PgPagoAdapter preference overwrite", () => {
  it("overwrites the stored preference with the legacy byte-identical UPDATE", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const pago = mintPago({ id: "order-1", total: { amount: 500, currency: "UYU" } }, "pref-fresh");

    await new PgPagoAdapter().save(stubTx(captured, [[]]), pago);

    expect(captured).toEqual([{ text: LEGACY_PREFERENCE, params: ["order-1", "pref-fresh"] }]);
  });
});

describe("PgWebhookAdapter ledger", () => {
  it("findByKey selects by provider and event id", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const tx = stubTx(captured, [[eventRow()]]);
    const found = await new PgWebhookAdapter().findByKey(tx, "mercadopago", "evt-1");

    expect(captured[0].params).toEqual(["mercadopago", "evt-1"]);
    expect(captured[0].text).toContain("FROM webhook_events WHERE provider = $1 AND event_id = $2");
    expect(found?.outcome).toBe("paid_oversell");
  });

  it("findByKey miss returns null", async () => {
    const found = await new PgWebhookAdapter().findByKey(stubTx([], [[]]), "mercadopago", "missing");

    expect(found).toBeNull();
  });

  it("save(received) claims first-insert-wins with the legacy INSERT", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const fresh = ingestWebhookEvent(null, {
      provider: "mercadopago",
      eventId: "evt-1",
      receivedAt: new Date("2026-09-09T10:00:00.000Z")
    });

    await new PgWebhookAdapter().save(stubTx(captured, [[]]), fresh);

    expect(captured).toEqual([{ text: LEGACY_CLAIM, params: ["mercadopago", "evt-1"] }]);
  });

  it("save(paid) advances with the legacy markEvent UPDATE", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const fresh = ingestWebhookEvent(null, {
      provider: "mercadopago",
      eventId: "evt-1",
      receivedAt: new Date("2026-09-09T10:00:00.000Z")
    });
    const committed = commitPaidVenta(fresh, {
      orderId: "order-1",
      approved: true,
      oversell: false,
      paymentId: "pay-1",
      paidAt: new Date("2026-09-09T10:01:00.000Z")
    });

    await new PgWebhookAdapter().save(stubTx(captured, [[]]), committed.event);

    expect(captured).toEqual([{ text: LEGACY_ADVANCE, params: ["mercadopago", "evt-1", "paid", "order-1"] }]);
  });

  it("save(paid_oversell) keeps the order link while flagging oversell", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const fresh = ingestWebhookEvent(null, {
      provider: "mercadopago",
      eventId: "evt-9",
      receivedAt: new Date("2026-09-09T10:00:00.000Z")
    });
    const committed = commitPaidVenta(fresh, {
      orderId: "order-9",
      approved: true,
      oversell: true,
      paymentId: "pay-9",
      paidAt: new Date("2026-09-09T10:01:00.000Z")
    });

    expect(committed.sale?.stockCommitted).toBe(false);
    await new PgWebhookAdapter().save(stubTx(captured, [[]]), committed.event);

    expect(captured).toEqual([
      { text: LEGACY_ADVANCE, params: ["mercadopago", "evt-9", "paid_oversell", "order-9"] }
    ]);
  });

  it("save(not_approved) stores the event leaving the sale linkage empty", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const fresh = ingestWebhookEvent(null, {
      provider: "mercadopago",
      eventId: "evt-2",
      receivedAt: new Date("2026-09-09T10:00:00.000Z")
    });
    const committed = commitPaidVenta(fresh, {
      orderId: "order-2",
      approved: false,
      oversell: false,
      paymentId: "pay-2",
      paidAt: new Date("2026-09-09T10:01:00.000Z")
    });

    expect(committed.sale).toBeNull();
    await new PgWebhookAdapter().save(stubTx(captured, [[]]), committed.event);

    expect(captured).toEqual([
      { text: LEGACY_ADVANCE, params: ["mercadopago", "evt-2", "not_approved", "order-2"] }
    ]);
  });

  it("save(deduped) throws: replays never touch the ledger", async () => {
    const existing = toDomainWebhookEvent({ ...eventRow(), status: "paid" });
    const replay = ingestWebhookEvent(existing, {
      provider: "mercadopago",
      eventId: "evt-1",
      receivedAt: new Date("2026-09-09T11:00:00.000Z")
    });

    expect(replay.outcome).toBe("deduped");
    await expect(new PgWebhookAdapter().save(stubTx([], [[]]), replay)).rejects.toThrow();
  });
});
