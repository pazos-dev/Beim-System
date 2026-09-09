/**
 * Cash adapter (slice 3.3, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests + SQL-text asserts. `findById`/`findOpen`
 * reuse the legacy `modules/gestion/repositories/pg-cash-sessions.ts`
 * getById/getCurrent SELECTs byte-identical; `findByBusinessDate` is new
 * (no legacy counterpart — additive read-only DELTA); `save` upserts the
 * whole scalar aggregate in one statement (legacy split gated-create/close
 * has no whole-aggregate counterpart — DELTA). Per-movement audit journal
 * rows stay edge-owned: the `CashStore` port carries no actor, and
 * `expected_amount` already folds every movement.
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { TxClient } from "../../domain/shared/ports.js";
import {
  closeCashSession,
  openCashSession,
  recordMovement
} from "../../domain/cash-session/cash-session.js";

// Dynamic imports AFTER the DATABASE_URL guard: adapters reach the shared
// Pool through config/db at module evaluation time (see
// pg-user-session.test.ts).
const { PgCashAdapter } = await import("./pg-cash.adapter.js");
const { toDomainCashSession } = await import("./pg-cash.mapper.js");

/** Legacy getById text, copied verbatim from pg-cash-sessions.ts. */
const LEGACY_BY_ID =
  "SELECT id, business_date, opening_amount, expected_amount, counted_amount,\n" +
  "  difference, status, notes, opened_at, closed_at FROM gestion_cash_sessions WHERE id = $1";

/** Legacy getCurrent text, copied verbatim from pg-cash-sessions.ts. */
const LEGACY_OPEN =
  "SELECT id, business_date, opening_amount, expected_amount, counted_amount,\n" +
  "  difference, status, notes, opened_at, closed_at FROM gestion_cash_sessions\n" +
  "       WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1";

const BY_DATE =
  "SELECT id, business_date, opening_amount, expected_amount, counted_amount,\n" +
  "  difference, status, notes, opened_at, closed_at FROM gestion_cash_sessions WHERE business_date = $1::date";

function stubTx(captured: Array<{ text: string; params: unknown[] }>, queued: unknown[][]): TxClient {
  const tx = {
    query: async (text: string, params: unknown[]) => {
      captured.push({ text, params });
      return { rows: queued.shift() ?? [] };
    }
  } as unknown as PoolClient;
  return tx as unknown as TxClient;
}

function openRow() {
  // pg DATE columns arrive as local-midnight Dates (never UTC midnight):
  // build the fixture the same way so the mapping is TZ-independent.
  return {
    id: "11111111-1111-4111-8111-111111111111",
    business_date: new Date(2026, 8, 9),
    opening_amount: "1000.00",
    expected_amount: "1250.50",
    counted_amount: null,
    difference: "0",
    status: "open",
    notes: "turno mañana",
    opened_at: new Date("2026-09-09T08:00:00.000Z"),
    closed_at: null
  };
}

describe("cash mapper", () => {
  it("maps an open row: numeric strings to numbers, difference null, no movements", () => {
    expect(toDomainCashSession(openRow())).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      businessDate: "2026-09-09",
      openingAmount: 1000,
      expectedAmount: 1250.5,
      countedAmount: null,
      difference: null,
      status: "open",
      notes: "turno mañana",
      movements: []
    });
  });

  it("maps a closed row keeping counted and difference", () => {
    const session = toDomainCashSession({
      ...openRow(),
      status: "closed",
      counted_amount: "1300.00",
      difference: "49.50"
    });

    expect(session.status).toBe("closed");
    expect(session.countedAmount).toBe(1300);
    expect(session.difference).toBe(49.5);
  });

  it("rejects unknown statuses fail-closed", () => {
    expect(() => toDomainCashSession({ ...openRow(), status: "archived" })).toThrow();
  });
});

describe("PgCashAdapter reads", () => {
  it("findById uses the legacy byte-identical SELECT", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const tx = stubTx(captured, [[openRow()]]);
    const found = await new PgCashAdapter().findById(tx, "11111111-1111-4111-8111-111111111111");

    expect(captured).toEqual([
      { text: LEGACY_BY_ID, params: ["11111111-1111-4111-8111-111111111111"] }
    ]);
    expect(found?.businessDate).toBe("2026-09-09");
  });

  it("findById miss returns null", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const found = await new PgCashAdapter().findById(stubTx(captured, [[]]), "nope");

    expect(found).toBeNull();
    expect(captured).toHaveLength(1);
  });

  it("findOpen uses the legacy getCurrent byte-identical SELECT", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const tx = stubTx(captured, [[openRow()]]);
    const found = await new PgCashAdapter().findOpen(tx);

    expect(captured).toEqual([{ text: LEGACY_OPEN, params: [] }]);
    expect(found?.status).toBe("open");
  });

  it("findByBusinessDate selects by date with a ::date cast", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const tx = stubTx(captured, [[]]);
    const found = await new PgCashAdapter().findByBusinessDate(tx, "2026-09-09");

    expect(captured).toEqual([{ text: BY_DATE, params: ["2026-09-09"] }]);
    expect(found).toBeNull();
  });
});

describe("PgCashAdapter save", () => {
  it("upserts the whole aggregate: open persists difference 0, movements fold into expected", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const tx = stubTx(captured, [[]]);
    const opened = openCashSession(
      { id: "11111111-1111-4111-8111-111111111111", businessDate: "2026-09-09", openingAmount: 1000 },
      { hasOpenSession: false }
    );
    const moved = recordMovement(opened, "venta", 250.5);

    await new PgCashAdapter().save(tx, moved);

    expect(captured).toHaveLength(1);
    expect(captured[0].text).toContain("INSERT INTO gestion_cash_sessions");
    expect(captured[0].text).toContain("ON CONFLICT (id) DO UPDATE");
    expect(captured[0].params).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "2026-09-09",
      1000,
      1250.5,
      null,
      0,
      "open",
      ""
    ]);
  });

  it("upserts a closed session keeping counted and difference", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const tx = stubTx(captured, [[]]);
    const opened = openCashSession(
      { id: "11111111-1111-4111-8111-111111111111", businessDate: "2026-09-09", openingAmount: 1000 },
      { hasOpenSession: false }
    );

    await new PgCashAdapter().save(tx, closeCashSession(opened, 1300));

    expect(captured[0].params).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "2026-09-09",
      1000,
      1000,
      1300,
      300,
      "closed",
      ""
    ]);
  });
});
