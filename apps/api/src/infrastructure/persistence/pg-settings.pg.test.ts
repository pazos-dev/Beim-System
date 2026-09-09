/**
 * Settings round-trip (slice 4.1, change `clean-arch-infrastructure`).
 *
 * `describePg`: the financial singleton upserts then merges partial
 * keeping capital; category create, audit append, fixed-expense keyed
 * doc and the promo published-only listing round-trip through the
 * ports. Skips without `TEST_DATABASE_URL`.
 */
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL (see
// pg-service.pg.test.ts): adapters reach the shared Pool through config/db
// at module evaluation time.
const { withTransaction } = await import("../../db/withTransaction.js");
const {
  PgAuditLogAdapter,
  PgCategoryAdapter,
  PgFinancialStateAdapter,
  PgFixedExpenseAdapter,
  PgPromoSlideAdapter
} = await import("./pg-settings.adapter.js");

describePg("settings drawer via ports", () => {
  it("singleton upserts; partial merge keeps capital", async () => {
    const adapter = new PgFinancialStateAdapter();
    await withTransaction(async (tx) => {
      const saved = await adapter.save(
        { singletonId: 1, capitalInitial: 5000, expenses: [], menuItems: [], accountingState: {}, preferences: {} },
        { accountingState: { openingBalances: 1000 } },
        tx
      );
      expect(saved.capitalInitial).toBe(5000);
      const loaded = await adapter.load(tx);
      expect(loaded.capitalInitial).toBe(5000);
      expect(loaded.accountingState).toEqual({ openingBalances: 1000 });
    });
  });

  it("category, audit, fixed expense and promo slides round-trip", async () => {
    await withTransaction(async (tx) => {
      await new PgCategoryAdapter().save(
        { id: "cat-i8", name: "Drawer", code: "DRW", description: null, parentId: null },
        tx
      );
      await new PgAuditLogAdapter().append(
        { action: "settings.merge", entityType: "financial_state", entityId: null, details: {} },
        tx
      );
      await new PgFixedExpenseAdapter().save(
        { id: "fx-i8", userId: null, expenseMonth: "2026-09", categoryName: "rent", amount: 100, notes: null },
        tx
      );
      await tx.query(
        `INSERT INTO promo_slides (id, eyebrow, title, text, image, sort_order, published)
         VALUES ('slide-i8', 'Nuevo', 'Oferta', 't', '/img/s.webp', 1, true)`,
        []
      );
      const slides = await new PgPromoSlideAdapter().listVisible(tx);
      expect(slides.map((s) => s.id)).toContain("slide-i8");
      await tx.query("DELETE FROM promo_slides WHERE id = 'slide-i8'", []);
      await tx.query("DELETE FROM categories WHERE id = 'cat-i8'", []);
      await tx.query("DELETE FROM app_settings WHERE key = 'gestion.fixed-expenses.fx-i8'", []);
    });
  });
});
