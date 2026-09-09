import { createHash } from "node:crypto";
import type { TxClient as DriverClient } from "../../db/withTransaction.js";
import type { TxClient } from "../../domain/shared/ports.js";
import type {
  StoredUploadResult,
  UploadIdempotencyStore
} from "../../application/uploads/ports.js";

/**
 * Upload idempotency persistence (slice 3.3, change `clean-arch-infrastructure`).
 *
 * Driven adapter behind `UploadIdempotencyStore` over the `idempotency_keys`
 * table (DDL `0004` — no new DDL). Rows live under scope `uploads` with an
 * empty `user_id` sentinel, disjoint from the middleware scopes
 * (`sales-batch`, `orders`, `checkout`, all UUID-keyed users) by
 * construction. INSERT/SELECT/UPDATE reuse the middleware
 * (`src/middleware/idempotency.ts`) texts byte-identical: claim
 * (`ON CONFLICT DO NOTHING`, first insert wins) then persist the 201
 * response, mirroring the middleware own-key flow. `request_hash` anchors
 * the stored response (sha256 of its canonical JSON); payload mismatch
 * detection stays middleware-owned. `findByKey` backs replay without
 * rewrite: misses and in-flight rows (null response) replay null, corrupt
 * payloads fail closed. Concurrent same-key saves are last-writer-wins —
 * the application checks `findByKey` first. Driver errors propagate
 * untouched for the edge `toAppError` mapping.
 */
const UPLOAD_SCOPE = "uploads";
const UPLOAD_USER = "";
const STORED_STATUS = 201;

const CLAIM_SQL = `INSERT INTO idempotency_keys (key, scope, user_id, request_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '24 hours')
       ON CONFLICT DO NOTHING`;

const FIND_SQL = `SELECT request_hash, response_status, response_json, expires_at
       FROM idempotency_keys WHERE key = $1 AND scope = $2 AND user_id = $3`;

const PERSIST_SQL = `UPDATE idempotency_keys SET response_status = $1, response_json = $2::jsonb
         WHERE key = $3 AND scope = $4 AND user_id = $5`;

interface IdempotencyKeyRow {
  request_hash: string;
  response_status: number | null;
  response_json: unknown;
  expires_at: Date;
}

/**
 * Bridges the opaque domain `TxClient` to the driver client (`ports.ts`:
 * adapters bridge the real driver here). Fail-closed: non-query handles
 * throw instead of touching the wrong connection.
 */
function driverOf(tx: TxClient): DriverClient {
  const candidate = tx as unknown as { query?: unknown };
  if (typeof candidate.query !== "function") {
    throw new Error("PgUploadIdempotencyAdapter requires a pg TxClient");
  }
  return tx as unknown as DriverClient;
}

function checkResult(value: unknown): StoredUploadResult {
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { url?: unknown }).url === "string" &&
    typeof (value as { filename?: unknown }).filename === "string" &&
    typeof (value as { bytes?: unknown }).bytes === "number"
  ) {
    const result = value as StoredUploadResult;
    return { url: result.url, filename: result.filename, bytes: result.bytes };
  }
  throw new Error("PgUploadIdempotencyAdapter: corrupt stored upload result");
}

export class PgUploadIdempotencyAdapter implements UploadIdempotencyStore {
  async findByKey(tx: TxClient, key: string): Promise<StoredUploadResult | null> {
    const { rows } = await driverOf(tx).query<IdempotencyKeyRow>(FIND_SQL, [key, UPLOAD_SCOPE, UPLOAD_USER]);
    const stored = rows[0];
    if (stored === undefined || stored.response_status === null) return null;
    return checkResult(stored.response_json);
  }

  async save(tx: TxClient, key: string, result: StoredUploadResult): Promise<void> {
    const client = driverOf(tx);
    const body = JSON.stringify({ url: result.url, filename: result.filename, bytes: result.bytes });
    await client.query(CLAIM_SQL, [
      key,
      UPLOAD_SCOPE,
      UPLOAD_USER,
      createHash("sha256").update(body).digest("hex")
    ]);
    await client.query(PERSIST_SQL, [STORED_STATUS, body, key, UPLOAD_SCOPE, UPLOAD_USER]);
  }
}
