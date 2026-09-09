/**
 * Service split-read (slice 2.5, change `clean-arch-infrastructure`).
 *
 * `describePg`: a service present in both the dedicated table (DDL `0007`)
 * and the legacy docs resolves from the table; a domain partial reprice
 * persists through the port while name/flag/data stay intact. Skips without
 * `TEST_DATABASE_URL`.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

  it("down-migration drops the table and reads fall back to docs", async () => {
    const id = randomUUID();
    await seedDoc(id, "Solo docs", false);
    const adapter = new PgServiceAdapter();
    const serviceId = createServiceId(id);

    await withTransaction(async (tx) => {
      await adapter.saveService(
        bridge(tx),
        createService({ id, name: "En tabla", priceAmount: 100, priceCurrency: "USD" })
      );
      expect((await adapter.findService(bridge(tx), serviceId))?.name).toBe("En tabla");
    });

    const dir = new URL("../../db/migrations/", import.meta.url);
    await query(await readFile(new URL("0007_services.down.sql", dir), "utf8"));
    const reg = await query<{ to_regclass: string | null }>(
      "SELECT to_regclass('public.services') AS to_regclass"
    );
    expect(reg.rows[0].to_regclass).toBeNull();

    await withTransaction(async (tx) => {
      const found = await adapter.findService(bridge(tx), serviceId);
      expect(found?.name).toBe("Solo docs");
      expect(found?.active).toBe(false);
      expect(found?.price).toEqual({ amount: 0, currency: "UYU" });
    });

    await query(await readFile(new URL("0007_services.sql", dir), "utf8"));
  });
});
