/**
 * Upload idempotency round-trip (slice 3.3, change `clean-arch-infrastructure`).
 *
 * `describePg`: a stored upload result replays without rewrite (a second
 * lookup returns the same payload and never duplicates rows); unknown keys
 * replay null. Skips without `TEST_DATABASE_URL`.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import type { TxClient } from "../../domain/shared/ports.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL (see
// pg-cash.pg.test.ts).
const { withTransaction } = await import("../../db/withTransaction.js");
const { PgUploadIdempotencyAdapter } = await import("./pg-idempotency.adapter.js");

type PgTx = Parameters<Parameters<typeof withTransaction>[0]>[0];

function bridge(tx: PgTx): TxClient {
  return tx as unknown as TxClient;
}

describePg("upload idempotency replay via port", () => {
  it("stored results replay without rewrite; unknown keys replay null", async () => {
    const adapter = new PgUploadIdempotencyAdapter();
    const key = randomUUID();
    const result = { url: "/api/v1/uploads/f.png", filename: "f.png", bytes: 12 };

    await withTransaction(async (tx) => {
      expect(await adapter.findByKey(bridge(tx), key)).toBeNull();
      await adapter.save(bridge(tx), key, result);
      expect(await adapter.findByKey(bridge(tx), key)).toEqual(result);
      expect(await adapter.findByKey(bridge(tx), key)).toEqual(result);
    });
  });
});
