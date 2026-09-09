import { describe, expect, it } from "vitest";
import {
  createAuditLog,
  createCategory,
  createFixedExpense,
  mergeFinancialState,
  sortPromoSlides,
  type FinancialState
} from "./settings.js";

const base: FinancialState = { singletonId: 1, capitalInitial: 5000 };

describe("settings", () => {
  it("merges partial keeping capital", () => {
    const merged = mergeFinancialState(base, { accountingState: { openingBalances: 1000 } });
    expect(merged.capitalInitial).toBe(5000);
    expect(merged.accountingState).toEqual({ openingBalances: 1000 });
    expect(base.accountingState).toBeUndefined();
  });

  it("rejects negative capital or opening", () => {
    expect(() => mergeFinancialState(base, { capitalInitial: -1 })).toThrow();
    expect(() => mergeFinancialState(base, { accountingState: { openingBalances: -5 } })).toThrow();
  });

  it("validates FixedExpense, Category, AuditLog and PromoSlide order", () => {
    expect(() => createFixedExpense({ id: "f1", expenseMonth: "2026-09", categoryName: "rent", amount: -1 })).toThrow();
    const expense = createFixedExpense({ id: "f1", expenseMonth: "2026-09", categoryName: "rent", amount: 100 });
    expect(expense.amount).toBe(100);
    expect(() => createCategory({ id: "c1", name: "", code: "x" })).toThrow();
    expect(() => createAuditLog({ action: "", entityType: "product" })).toThrow();
    const visible = sortPromoSlides([
      { id: "2", sortOrder: 2, published: true },
      { id: "1", sortOrder: 1, published: false },
      { id: "3", sortOrder: 1, published: true }
    ]);
    expect(visible.map((s) => s.id)).toEqual(["3", "2"]);
  });
});
