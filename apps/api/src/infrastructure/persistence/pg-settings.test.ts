/**
 * Settings/drawer adapters (slice 4.1, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests + SQL-text asserts against the legacy
 * repositories verbatim (`pg-financial-state.ts`, `pg-audit-logs.ts`,
 * `pg-categories.ts`, `pg-promo-slides.ts`, `pg-invoice-settings.ts`).
 * `save` on the financial singleton merges absent-keep via the domain
 * `mergeFinancialState` before the byte-identical upsert; fixed expenses
 * are NEW keyed-JSON docs (`gestion.fixed-expenses.<id>`, same upsert
 * shape as `invoice.settings` — additive DELTA, no legacy counterpart).
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { TxClient } from "../../domain/shared/ports.js";
import type { TxClient as DriverClient } from "../../db/withTransaction.js";
import { mergeFinancialState } from "../../domain/settings/settings.js";

// Dynamic imports AFTER the DATABASE_URL guard: adapters reach the shared
// Pool through config/db at module evaluation time (see
// pg-user-session.test.ts).
const { PgAuditLogAdapter, PgCategoryAdapter, PgFinancialStateAdapter, PgFixedExpenseAdapter, PgPromoSlideAdapter } =
  await import("./pg-settings.adapter.js");
const { toDomainFinancialState, toDomainPromoSlide } = await import("./pg-settings.mapper.js");

/** Legacy getSingleton text, copied verbatim from pg-financial-state.ts. */
const LEGACY_FINANCIAL_GET = "SELECT * FROM gestion_financial_state WHERE singleton_id = 1";

/** Legacy upsertSingleton text, copied verbatim from pg-financial-state.ts. */
const LEGACY_FINANCIAL_UPSERT =
  `INSERT INTO gestion_financial_state
         (singleton_id, capital_initial, expenses, menu_items, accounting_state, preferences)
       VALUES (1, $1, $2, $3, $4, $5)
       ON CONFLICT (singleton_id) DO UPDATE
         SET capital_initial = EXCLUDED.capital_initial,
             expenses = EXCLUDED.expenses,
             menu_items = EXCLUDED.menu_items,
             accounting_state = EXCLUDED.accounting_state,
             preferences = EXCLUDED.preferences,
             updated_at = now()
       RETURNING *`;

/** Legacy audit insert text, copied verbatim from pg-audit-logs.ts. */
const LEGACY_AUDIT_INSERT =
  `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
           SELECT u.id, $2::text, $3, $4, $5, $6::jsonb
           FROM (SELECT $1::uuid AS id) AS a LEFT JOIN users u ON u.id = a.id
           RETURNING id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at`;

/** Legacy category create text, copied verbatim from pg-categories.ts. */
const LEGACY_CATEGORY_CREATE =
  `INSERT INTO categories (id, name, code, description)
         VALUES ($1, $2, $3, '')
         RETURNING id, name, code, parent_id, is_active`;

/** Legacy promo listPublished text, copied verbatim from pg-promo-slides.ts. */
const LEGACY_PROMO_LIST =
  `SELECT id, eyebrow, title, text, image, primary_label, primary_href,
              secondary_label, secondary_href, sort_order
       FROM promo_slides
       WHERE published = true
       ORDER BY sort_order ASC, created_at ASC`;

/** Keyed-JSON upsert shape, copied verbatim from pg-invoice-settings.ts. */
const KEYED_UPSERT =
  `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING key, value`;

function stubTx(captured: Array<{ text: string; params: unknown[] }>, queued: unknown[][]): DriverClient {
  const tx = {
    query: async (text: string, params: unknown[]) => {
      captured.push({ text, params });
      return { rows: queued.shift() ?? [] };
    }
  } as unknown as PoolClient;
  return tx as unknown as DriverClient;
}

function financialRow() {
  return {
    singleton_id: 1,
    capital_initial: "5000.00",
    expenses: [],
    menu_items: [],
    accounting_state: {},
    preferences: {},
    updated_at: new Date("2026-09-09T08:00:00.000Z")
  };
}

describe("settings mappers", () => {
  it("maps the singleton row: numeric capital to number, jsonb passthrough", () => {
    expect(toDomainFinancialState(financialRow())).toEqual({
      singletonId: 1,
      capitalInitial: 5000,
      expenses: [],
      menuItems: [],
      accountingState: {},
      preferences: {}
    });
  });

  it("maps a promo row to the visible domain slide", () => {
    expect(
      toDomainPromoSlide({
        id: "s1",
        eyebrow: "Nuevo",
        title: "Oferta",
        text: "texto",
        image: "/img/s1.webp",
        primary_label: null,
        primary_href: null,
        secondary_label: null,
        secondary_href: null,
        sort_order: 2
      })
    ).toEqual({ id: "s1", sortOrder: 2, published: true, title: "Oferta", image: "/img/s1.webp" });
  });
});

describe("settings adapters SQL", () => {
  it("loads the singleton with the legacy SELECT", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const state = await new PgFinancialStateAdapter().load(stubTx(captured, [[financialRow()]]));
    expect(captured).toHaveLength(1);
    expect(captured[0].text).toBe(LEGACY_FINANCIAL_GET);
    expect(state.capitalInitial).toBe(5000);
  });

  it("merges partial over the stored row keeping capital, then upserts byte-identical", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const merged = mergeFinancialState(
      { singletonId: 1, capitalInitial: 5000 },
      { accountingState: { openingBalances: 1000 } }
    );
    const state = await new PgFinancialStateAdapter().save(
      { singletonId: 1, capitalInitial: 5000 },
      { accountingState: { openingBalances: 1000 } },
      stubTx(captured, [[financialRow()], [financialRow()]])
    );
    expect(captured).toHaveLength(2);
    expect(captured[1].text).toBe(LEGACY_FINANCIAL_UPSERT);
    expect(captured[1].params[0]).toBe(merged.capitalInitial);
    expect(captured[1].params[3]).toBe(JSON.stringify(merged.accountingState));
    expect(state.capitalInitial).toBe(5000);
  });

  it("appends the audit journal with the legacy INSERT and no actor identity", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    await new PgAuditLogAdapter().append(
      {
        action: "stock.movement",
        entityType: "product",
        entityId: "p1",
        details: { qty: 2 }
      },
      stubTx(captured, [[{}]])
    );
    expect(captured).toHaveLength(1);
    expect(captured[0].text).toBe(LEGACY_AUDIT_INSERT);
    // FK-safe: no caller identity crosses — the port carries no actor.
    expect(captured[0].params[0]).toBeNull();
    expect(captured[0].params[2]).toBe("stock.movement");
  });

  it("creates the category with the legacy INSERT", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    await new PgCategoryAdapter().save(
      {
        id: "c1",
        name: "Almacén",
        code: "ALM",
        description: null,
        parentId: null
      },
      stubTx(captured, [[{}]])
    );
    expect(captured).toHaveLength(1);
    expect(captured[0].text).toBe(LEGACY_CATEGORY_CREATE);
    expect(captured[0].params).toEqual(["c1", "Almacén", "ALM"]);
  });

  it("lists visible slides with the legacy published-only SELECT", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    const slides = await new PgPromoSlideAdapter().listVisible(stubTx(captured, [[
      {
        id: "s1",
        eyebrow: "Nuevo",
        title: "Oferta",
        text: "t",
        image: "/img/s1.webp",
        primary_label: null,
        primary_href: null,
        secondary_label: null,
        secondary_href: null,
        sort_order: 1
      }
    ]]));
    expect(captured).toHaveLength(1);
    expect(captured[0].text).toBe(LEGACY_PROMO_LIST);
    expect(slides.map((s) => s.id)).toEqual(["s1"]);
  });

  it("saves a fixed expense as a keyed-JSON doc with the invoice-settings upsert shape", async () => {
    const captured: Array<{ text: string; params: unknown[] }> = [];
    await new PgFixedExpenseAdapter().save(
      {
        id: "f1",
        userId: null,
        expenseMonth: "2026-09",
        categoryName: "rent",
        amount: 100,
        notes: null
      },
      stubTx(captured, [[{}]])
    );
    expect(captured).toHaveLength(1);
    expect(captured[0].text).toBe(KEYED_UPSERT);
    expect(captured[0].params[0]).toBe("gestion.fixed-expenses.f1");
    const doc = JSON.parse(captured[0].params[1] as string) as { amount: number };
    expect(doc.amount).toBe(100);
  });
});
