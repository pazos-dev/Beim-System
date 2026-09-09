/**
 * Service split-read (slice 2.5, change `clean-arch-infrastructure`).
 *
 * `describePg`: a service present in both the dedicated table (DDL `0007`)
 * and the legacy docs resolves from the table; a domain partial reprice
 * persists through the port while name/flag/data stay intact. Skips without
 * `TEST_DATABASE_URL`.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import type { TxClient } from "../../domain/shared/ports.js";
import { createServiceId } from "../../domain/shared/types.js";
import { createService, repriceService } from "../../domain/service/service.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL (see
// pg-user-session.pg.test.ts): the seeds reach the shared Pool through
// config/db at module evaluation time.
const { query } = await import("../../config/db.js");
const { withTransaction } = await import("../../db/withTransaction.js");
const { PgServiceAdapter } = await import("./pg-service.adapter.js");
const { SERVICE_DOC_PREFIX } = await import("./pg-service.mapper.js");

type PgTx = Parameters<Parameters<typeof withTransaction>[0]>[0];

function bridge(tx: PgTx): TxClient {
  return tx as unknown as TxClient;
}

async function seedDoc(id: string, name: string, isActive: boolean): Promise<void> {
  await query("INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)", [
    SERVICE_DOC_PREFIX + id,
    JSON.stringify({ name, data: {}, isActive })
  ]);
}

describePg("service split-read via port", () => {
  it("table row wins over docs; partial reprice keeps the rest", async () => {
    const id = randomUUID();
    await seedDoc(id, "Viejo", true);
    const adapter = new PgServiceAdapter();
    const serviceId = createServiceId(id);

    await withTransaction(async (tx) => {
      await adapter.saveService(
        bridge(tx),
        createService({ id, name: "Nuevo", priceAmount: 500, priceCurrency: "UYU", data: { warranty: "30d" } })
      );
      const loaded = await adapter.findService(bridge(tx), serviceId);
      expect(loaded?.name).toBe("Nuevo");
      expect(loaded?.price).toEqual({ amount: 500, currency: "UYU" });

      await adapter.saveService(bridge(tx), repriceService(loaded!, 750));
      const after = await adapter.findService(bridge(tx), serviceId);
      expect(after?.price).toEqual({ amount: 750, currency: "UYU" });
      expect(after?.name).toBe("Nuevo");
      expect(after?.active).toBe(true);
      expect(after?.data).toEqual({ warranty: "30d" });
    });
  });
});
