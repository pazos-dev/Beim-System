/**
 * Cash round-trip (slice 3.3, change `clean-arch-infrastructure`).
 *
 * `describePg`: an opened session round-trips through the port
 * (`findById`/`findOpen`/`findByBusinessDate`), closing flips it and clears
 * the open slot; a second id on the same business date violates the schema
 * UNIQUE constraint (the DB backstop behind the application 409). Skips
 * without `TEST_DATABASE_URL`.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import type { TxClient } from "../../domain/shared/ports.js";
import { closeCashSession, openCashSession } from "../../domain/cash-session/cash-session.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL (see
// pg-service.pg.test.ts): adapters reach the shared Pool through config/db
// at module evaluation time.
const { withTransaction } = await import("../../db/withTransaction.js");
const { PgCashAdapter } = await import("./pg-cash.adapter.js");

type PgTx = Parameters<Parameters<typeof withTransaction>[0]>[0];

function bridge(tx: PgTx): TxClient {
  return tx as unknown as TxClient;
}

describePg("cash session guard via port", () => {
  it("open round-trips; close clears the open slot", async () => {
    const adapter = new PgCashAdapter();
    const id = randomUUID();
    const opened = openCashSession(
      { id, businessDate: "2026-09-09", openingAmount: 1000, notes: "pg" },
      { hasOpenSession: false }
    );

    await withTransaction(async (tx) => {
      await adapter.save(bridge(tx), opened);
      expect((await adapter.findById(bridge(tx), id))?.expectedAmount).toBe(1000);
      expect((await adapter.findOpen(bridge(tx)))?.id).toBe(id);
      expect((await adapter.findByBusinessDate(bridge(tx), "2026-09-09"))?.id).toBe(id);
      await adapter.save(bridge(tx), closeCashSession(opened, 1200));
      expect(await adapter.findOpen(bridge(tx))).toBeNull();
      expect((await adapter.findById(bridge(tx), id))?.difference).toBe(200);
    });
  });

  it("a second id on the same business date violates the UNIQUE backstop", async () => {
    const adapter = new PgCashAdapter();
    const first = openCashSession(
      { id: randomUUID(), businessDate: "2026-09-10", openingAmount: 10 },
      { hasOpenSession: false }
    );
    const second = openCashSession(
      { id: randomUUID(), businessDate: "2026-09-10", openingAmount: 20 },
      { hasOpenSession: true }
    );

    await withTransaction(async (tx) => {
      await adapter.save(bridge(tx), first);
    });
    await expect(
      withTransaction(async (tx) => {
        await adapter.save(bridge(tx), second);
      })
    ).rejects.toThrow();
  });
});
