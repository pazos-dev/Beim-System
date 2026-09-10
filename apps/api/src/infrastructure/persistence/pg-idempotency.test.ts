/**
 * Upload idempotency adapter (slice 3.3, change `clean-arch-infrastructure`).
 *
 * DB-free: replay mapping + SQL-text asserts. Reuses the `idempotency_keys`
 * table (DDL `0004`, no new DDL) under scope `uploads` with an empty
 * `user_id` sentinel — disjoint from the middleware scopes
 * (`sales-batch`, `orders`, `checkout`) and real UUID user ids by
 * construction. INSERT/SELECT/UPDATE reuse the middleware
 * (`src/interface/http/edge/idempotency.ts`) statement texts byte-identical;
 * `request_hash` anchors the stored response (mismatch detection stays
 * middleware-owned) and TTL keeps the 24h parity. In-flight rows
 * (`response_status` null) replay as null; corrupt payloads fail closed.
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { TxClient } from "../../domain/shared/ports.js";

// Dynamic imports AFTER the DATABASE_URL guard (see pg-cash.test.ts).
const { PgUploadIdempotencyAdapter } = await import("./pg-idempotency.adapter.js");

/** Middleware claim text, copied verbatim from src/interface/http/edge/idempotency.ts. */
const LEGACY_INSERT = `INSERT INTO idempotency_keys (key, scope, user_id, request_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '24 hours')
       ON CONFLICT DO NOTHING`;

/** Middleware lookup text, copied verbatim from src/interface/http/edge/idempotency.ts. */
const LEGACY_SELECT = `SELECT request_hash, response_status, response_json, expires_at
       FROM idempotency_keys WHERE key = $1 AND scope = $2 AND user_id = $3`;

/** Middleware persist text, copied verbatim from src/interface/http/edge/idempotency.ts. */
const LEGACY_UPDATE = `UPDATE idempotency_keys SET response_status = $1, response_json = $2::jsonb
         WHERE key = $3 AND scope = $4 AND user_id = $5`;

function stubTx(captured: Array<{ text: string; params: unknown[] }>, queued: unknown[][]): TxClient {
  const tx = {
    query: async (text: string, params: unknown[]) => {
      captured.push({ text, params });
      return { rows: queued.shift() ?? [] };
    }
  } as unknown as PoolClient;
  return tx as unknown as TxClient;
}

const RESULT = { url: "/api/v1/uploads/f.png", filename: "f.png", bytes: 12 };

function storedRow() {
  return {
    request_hash: "abc",
    response_status: 201,
    response_json: { ...RESULT },
    expires_at: new Date("2026-09-10T10:00:00.000Z")
  };
}

describe("PgUploadIdempotencyAdapter replay", () => {
  it("findByKey replays the stored result with the legacy SELECT", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const found = await new PgUploadIdempotencyAdapter().findByKey(stubTx(captured, [[storedRow()]]), "key-1");

    expect(captured).toEqual([{ text: LEGACY_SELECT, params: ["key-1", "uploads", ""] }]);
    expect(found).toEqual(RESULT);
  });

  it("findByKey miss replays null", async () => {
    const found = await new PgUploadIdempotencyAdapter().findByKey(stubTx([], [[]]), "missing");

    expect(found).toBeNull();
  });

  it("in-flight rows (no stored response yet) replay null", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const found = await new PgUploadIdempotencyAdapter().findByKey(
      stubTx(captured, [[{ ...storedRow(), response_status: null }]]),
      "key-1"
    );

    expect(found).toBeNull();
    expect(captured).toHaveLength(1);
  });

  it("corrupt stored payloads fail closed", async () => {
    await expect(
      new PgUploadIdempotencyAdapter().findByKey(stubTx([], [[{ ...storedRow(), response_json: { nope: 1 } }]]), "key-1")
    ).rejects.toThrow();
  });
});

describe("PgUploadIdempotencyAdapter save", () => {
  it("claims then persists with the legacy INSERT + UPDATE", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    await new PgUploadIdempotencyAdapter().save(stubTx(captured, [[], []]), "key-1", RESULT);

    expect(captured).toHaveLength(2);
    expect(captured[0].text).toBe(LEGACY_INSERT);
    expect(captured[0].params.slice(0, 3)).toEqual(["key-1", "uploads", ""]);
    expect(typeof captured[0].params[3]).toBe("string");
    expect(captured[1].text).toBe(LEGACY_UPDATE);
    expect(captured[1].params.slice(0, 1)).toEqual([201]);
    expect(JSON.parse(captured[1].params[1] as string)).toEqual(RESULT);
    expect(captured[1].params.slice(2)).toEqual(["key-1", "uploads", ""]);
  });
});
