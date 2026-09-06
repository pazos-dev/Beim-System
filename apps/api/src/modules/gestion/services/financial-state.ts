/**
 * Financial-state service (PR 3).
 *
 * The gestion_financial_state row is a singleton (singleton_id=1). `get`
 * returns the stored row or the documented default when none exists.
 *
 * `upsert` MERGES partial updates over the current state — absent fields keep
 * their stored values (documented deviation from the legacy full-replace PUT:
 * the webpanel sends the whole object, but partial batches are safer for the
 * new API). Validation (422): capitalInitial >= 0 and every opening balance
 * under accountingState.openingBalances (cash/bank/card/wallet) >= 0.
 */
import { ValidationError } from "../../../errors/taxonomy.js";
import type { FinancialStateData, FinancialStateRow, JsonValue } from "../ports.js";
import { financialStateRepository } from "../repositories/pg-financial-state.js";

export const financialStateService = {
  /** The singleton row, or the documented default when no row exists yet. */
  async get(): Promise<FinancialStateRow> {
    const row = await financialStateRepository.getSingleton();
    if (row !== null) return row;
    // updatedAt: epoch — the null-state default has no meaningful timestamp.
    return {
      singletonId: 1,
      capitalInitial: 0,
      expenses: [],
      menuItems: [],
      accountingState: {},
      preferences: {},
      updatedAt: new Date(0)
    };
  },

  /** Merges `partial` over the current state and upserts the result. */
  async upsert(partial: Partial<FinancialStateData>): Promise<FinancialStateRow> {
    const current = await this.get();
    const merged: FinancialStateData = {
      capitalInitial: partial.capitalInitial ?? current.capitalInitial,
      expenses: partial.expenses ?? current.expenses,
      menuItems: partial.menuItems ?? current.menuItems,
      accountingState: partial.accountingState ?? current.accountingState,
      preferences: partial.preferences ?? current.preferences
    };

    if (merged.capitalInitial < 0) {
      throw new ValidationError("El capital inicial no puede ser negativo", {
        field: "capitalInitial"
      });
    }
    assertNonNegativeOpeningBalances(merged.accountingState);

    return financialStateRepository.upsertSingleton(merged);
  }
};

function assertNonNegativeOpeningBalances(accountingState: JsonValue): void {
  if (typeof accountingState !== "object" || accountingState === null || Array.isArray(accountingState)) {
    return;
  }
  const opening = (accountingState as Record<string, unknown>).openingBalances;
  if (typeof opening !== "object" || opening === null || Array.isArray(opening)) {
    return;
  }
  for (const [key, value] of Object.entries(opening as Record<string, unknown>)) {
    if (typeof value === "number" && value < 0) {
      throw new ValidationError("Los saldos de apertura no pueden ser negativos", {
        field: `accountingState.openingBalances.${key}`
      });
    }
  }
}