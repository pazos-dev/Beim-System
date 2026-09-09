import type { TxClient as DriverClient } from "../../db/withTransaction.js";
import type { TxClient } from "../../domain/shared/ports.js";
import type { ServiceId } from "../../domain/shared/types.js";
import type { Service } from "../../domain/service/service.js";
import type { CatalogServiceStore } from "../../application/catalog/ports.js";
import {
  SERVICE_DOC_PREFIX,
  toDomainService,
  toDomainServiceFromDoc,
  type ServiceDocRow,
  type ServiceTableRow
} from "./pg-service.mapper.js";

/**
 * Service persistence (slice 2.5, change `clean-arch-infrastructure`).
 *
 * Driven adapter behind `CatalogServiceStore`. Dual-read: the dedicated
 * `services` table (DDL `0007`) first, legacy `app_settings` docs
 * (`gestion.services.<uuid>`) as fallback — the fallback SELECT is copied
 * byte-identical from `modules/gestion/repositories/pg-services.ts` getById.
 * Saves upsert the whole aggregate in one statement; partial merges live in
 * the domain (`updateService`), never in SQL.
 */
const FIND_TABLE_SQL =
  "SELECT id, name, price_amount, price_currency, active, data, updated_at FROM services WHERE id = $1";

const FIND_DOC_SQL = "SELECT key, value FROM app_settings WHERE key = $1";

const SAVE_SQL =
  "INSERT INTO services (id, name, price_amount, price_currency, active, data, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now()) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_amount = EXCLUDED.price_amount, price_currency = EXCLUDED.price_currency, active = EXCLUDED.active, data = EXCLUDED.data, updated_at = now()";

/**
 * Bridges the opaque domain `TxClient` to the driver client (`ports.ts`:
 * adapters bridge the real driver here). Fail-closed: non-query handles
 * throw instead of touching the wrong connection.
 */
function driverOf(tx: TxClient): DriverClient {
  const candidate = tx as unknown as { query?: unknown };
  if (typeof candidate.query !== "function") {
    throw new Error("PgServiceAdapter requires a pg TxClient");
  }
  return tx as unknown as DriverClient;
}

export class PgServiceAdapter implements CatalogServiceStore {
  async findService(tx: TxClient, id: ServiceId): Promise<Service | null> {
    const client = driverOf(tx);
    const table = await client.query<ServiceTableRow>(FIND_TABLE_SQL, [id]);
    if (table.rows[0] !== undefined) return toDomainService(table.rows[0]);
    const docs = await client.query<ServiceDocRow>(FIND_DOC_SQL, [SERVICE_DOC_PREFIX + id]);
    if (docs.rows[0] === undefined) return null;
    return toDomainServiceFromDoc(docs.rows[0]);
  }

  async saveService(tx: TxClient, service: Service): Promise<void> {
    const client = driverOf(tx);
    await client.query(SAVE_SQL, [
      service.id,
      service.name,
      service.price.amount,
      service.price.currency,
      service.active,
      JSON.stringify(service.data)
    ]);
  }
}
