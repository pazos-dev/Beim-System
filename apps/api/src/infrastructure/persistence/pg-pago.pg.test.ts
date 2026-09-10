/**
 * Webhook dedup + oversell ledger (slice 3.3, change `clean-arch-infrastructure`).
 *
 * `describePg`: a redelivered `(provider, event_id)` keeps the first row
 * (claim lost the race, sale untouched — `order_id` stays null); an approved
 * commit flips the ledger to `paid_oversell` keeping the order link, which
 * is what the application pairs with `stock_committed=false` on the sale.
 * The paid flip on `orders` itself belongs to the pending Venta adapter
 * (slice 3.1). Skips without `TEST_DATABASE_URL`.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import type { TxClient } from "../../domain/shared/ports.js";
import { commitPaidVenta, ingestWebhookEvent } from "../../domain/pago/webhook-event.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL (see
// pg-cash.pg.test.ts).
const { query } = await import("../../config/db.js");
const { withTransaction } = await import("../../db/withTransaction.js");
const { PgWebhookAdapter } = await import("./pg-pago.adapter.js");

type PgTx = Parameters<Parameters<typeof withTransaction>[0]>[0];

function bridge(tx: PgTx): TxClient {
  return tx as unknown as TxClient;
}

const NOW = new Date("2026-09-09T10:00:00.000Z");

describePg("webhook first-insert-wins via port", () => {
  it("a redelivery keeps the first row with the sale untouched", async () => {
    const adapter = new PgWebhookAdapter();
    const eventId = `evt-${randomUUID()}`;
    const first = ingestWebhookEvent(null, { provider: "mercadopago", eventId, receivedAt: NOW });

    await withTransaction(async (tx) => {
      await adapter.save(bridge(tx), first);
      // Redelivery: the application replays `deduped` with zero saves, so a
      // second claim must change nothing even if it races through.
      await adapter.save(bridge(tx), first);
      const stored = await adapter.findByKey(bridge(tx), "mercadopago", eventId);
      expect(stored?.outcome).toBe("received");
      expect(stored?.orderId).toBeNull();
    });
  });

  it("an approved oversell commit flags the ledger keeping the order link", async () => {
    const adapter = new PgWebhookAdapter();
    const eventId = `evt-${randomUUID()}`;
    const orderId = `order-${randomUUID()}`;
    await query("INSERT INTO orders (id, customer) VALUES ($1, 'pg-oversell')", [orderId]);
    const fresh = ingestWebhookEvent(null, { provider: "mercadopago", eventId, receivedAt: NOW });
    const committed = commitPaidVenta(fresh, {
      orderId,
      approved: true,
      oversell: true,
      paymentId: "pay-1",
      paidAt: NOW
    });

    await withTransaction(async (tx) => {
      await adapter.save(bridge(tx), fresh);
      await adapter.save(bridge(tx), committed.event);
      const stored = await adapter.findByKey(bridge(tx), "mercadopago", eventId);
      expect(stored?.outcome).toBe("paid_oversell");
      expect(stored?.orderId).toBe(orderId);
    });
  });
});
