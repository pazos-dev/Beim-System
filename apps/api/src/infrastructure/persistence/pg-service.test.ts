/**
 * Service adapter (slice 2.5/2.6, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests + SQL-text asserts. The table SELECT is new
 * (DDL `0007`); the docs fallback SELECT is byte-identical to the legacy
 * `modules/gestion/repositories/pg-services.ts` getById. Split-read: the
 * table wins and docs are never touched.
 */
import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { TxClient } from "../../domain/shared/ports.js";
import { createService } from "../../domain/service/service.js";
import { createServiceId } from "../../domain/shared/types.js";
import { PgServiceAdapter } from "./pg-service.adapter.js";
import {
  SERVICE_DOC_PREFIX,
  toDomainService,
  toDomainServiceFromDoc
} from "./pg-service.mapper.js";

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
