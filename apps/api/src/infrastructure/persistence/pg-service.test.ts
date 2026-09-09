/**
 * Service adapter (slice 2.5/2.6, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests + SQL-text asserts. The table SELECT is new
 * (DDL `0007`); the docs fallback SELECT is byte-identical to the legacy
 * `modules/gestion/repositories/pg-services.ts` getById. Split-read: the
 * table wins and docs are never touched.
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import type { TxClient } from "../../domain/shared/ports.js";
import { createService } from "../../domain/service/service.js";
import { createServiceId } from "../../domain/shared/types.js";

// The post-down fallback reads docs on a fresh connection (the caller tx is
// aborted): mock the shared pool so that branch stays DB-free. The factory
// answers from its params — no outer references allowed (hoisted).
const freshQueries: string[] = [];
vi.mock("../../config/db.js", () => ({
  query: async (text: string, params: unknown[]) => {
    freshQueries.push(text);
    return { rows: [{ key: params[0], value: { name: "Solo docs", data: {} } }] };
  }
}));

// Dynamic imports AFTER the DATABASE_URL guard: the adapter reaches the
// shared Pool through config/db at module evaluation time (see
// pg-user-session.test.ts).
const { PgServiceAdapter } = await import("./pg-service.adapter.js");
const { SERVICE_DOC_PREFIX, toDomainService, toDomainServiceFromDoc } = await import(
  "./pg-service.mapper.js"
);

const ID = "123e4567-e89b-12d3-a456-426614174000";

/** Legacy getById text, copied verbatim from pg-services.ts (fallback must not drift). */
const LEGACY_DOC_SELECT = "SELECT key, value FROM app_settings WHERE key = $1";

const TABLE_SELECT =
  "SELECT id, name, price_amount, price_currency, active, data, updated_at FROM services WHERE id = $1";

function stubTx(captured: string[], queued: unknown[][]): TxClient {
  const tx = {
    query: async (text: string) => {
      captured.push(text);
      return { rows: queued.shift() ?? [] };
    }
  } as unknown as PoolClient;
  return tx as unknown as TxClient;
}

describe("service mappers", () => {
  it("maps a table row to exactly the Service shape", () => {
    const service = toDomainService({
      id: ID,
      name: "Mano de obra",
      price_amount: "500.00",
      price_currency: "UYU",
      active: true,
      data: { warranty: "30d" },
      updated_at: new Date("2026-09-01T00:00:00.000Z")
    });

    expect(service).toEqual({
      id: createServiceId(ID),
      name: "Mano de obra",
      price: { amount: 500, currency: "UYU" },
      active: true,
      data: { warranty: "30d" },
      updatedAt: new Date("2026-09-01T00:00:00.000Z")
    });
  });

  it("maps a docs row with active default and zero price (legacy stores no price)", () => {
    const service = toDomainServiceFromDoc({
      key: `${SERVICE_DOC_PREFIX}${ID}`,
      value: { name: "Reparación", data: { note: "x" } }
    });

    expect(service).toEqual({
      id: createServiceId(ID),
      name: "Reparación",
      price: { amount: 0, currency: "UYU" },
      active: true,
      data: { note: "x" },
      updatedAt: null
    });
  });
});

describe("PgServiceAdapter dual-read", () => {
  it("table hit wins: docs are never queried", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [
      [
        {
          id: ID,
          name: "Mano de obra",
          price_amount: 750,
          price_currency: "UYU",
          active: true,
          data: {},
          updated_at: null
        }
      ]
    ]);
    const found = await new PgServiceAdapter().findService(tx, createServiceId(ID));

    expect(found?.price).toEqual({ amount: 750, currency: "UYU" });
    expect(captured).toEqual([TABLE_SELECT]);
  });

  it("table miss falls back to docs with the legacy byte-identical SELECT", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [
      [],
      [{ key: `${SERVICE_DOC_PREFIX}${ID}`, value: { name: "Viejo", isActive: false, data: {} } }]
    ]);
    const found = await new PgServiceAdapter().findService(tx, createServiceId(ID));

    expect(found?.name).toBe("Viejo");
    expect(found?.active).toBe(false);
    expect(captured).toEqual([TABLE_SELECT, LEGACY_DOC_SELECT]);
  });

  it("miss in both sources returns null", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [[], []]);
    const found = await new PgServiceAdapter().findService(tx, createServiceId(ID));

    expect(found).toBeNull();
    expect(captured).toHaveLength(2);
  });

  it("missing table (42P01, post-down) falls back to docs instead of throwing", async () => {
    freshQueries.length = 0;
    const captured: string[] = [];
    const tableErr = Object.assign(new Error("relation \"services\" does not exist"), { code: "42P01" });
    const tx = {
      query: async (text: string) => {
        captured.push(text);
        throw tableErr;
      }
    } as unknown as PoolClient;
    const found = await new PgServiceAdapter().findService(tx as unknown as TxClient, createServiceId(ID));

    expect(found?.name).toBe("Solo docs");
    expect(captured).toEqual([TABLE_SELECT]);
    expect(freshQueries).toEqual([LEGACY_DOC_SELECT]);
  });

  it("non-missing-table errors still throw", async () => {
    const tx = {
      query: async () => {
        throw Object.assign(new Error("connection reset"), { code: "08006" });
      }
    } as unknown as PoolClient;
    await expect(
      new PgServiceAdapter().findService(tx as unknown as TxClient, createServiceId(ID))
    ).rejects.toThrow("connection reset");
  });

  it("saveService upserts the whole aggregate in one statement", async () => {
    const captured: string[] = [];
    let params: unknown[] = [];
    const tx = {
      query: async (text: string, values: unknown[]) => {
        captured.push(text);
        params = values;
        return { rows: [] };
      }
    } as unknown as PoolClient;
    const service = createService({
      id: ID,
      name: "Mano de obra",
      priceAmount: 500,
      priceCurrency: "UYU",
      data: { warranty: "30d" }
    });

    await new PgServiceAdapter().saveService(tx as unknown as TxClient, service);

    expect(captured).toEqual([
      "INSERT INTO services (id, name, price_amount, price_currency, active, data, updated_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now()) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_amount = EXCLUDED.price_amount, price_currency = EXCLUDED.price_currency, active = EXCLUDED.active, data = EXCLUDED.data, updated_at = now()"
    ]);
    expect(params).toEqual([ID, "Mano de obra", 500, "UYU", true, JSON.stringify({ warranty: "30d" })]);
  });
});
