/**
 * Postgres FinancialStatePort implementation (task 3.4).
 *
 * `gestion_financial_state` is a singleton table (PK check singleton_id = 1).
 * getSingleton reads the single row; upsertSingleton is INSERT ... ON
 * CONFLICT, which keeps exactly one row. jsonb columns (expenses, menu_items,
 * accounting_state, preferences) are passed through unchanged — node-postgres
 * serializes JS values to jsonb and parses them back, so unknown keys survive
 * round trips (spec: JSONB backward compatibility).
 */
import { query } from "../../../config/db.js";
import type { FinancialStateData, FinancialStatePort, FinancialStateRow, JsonValue } from "../ports.js";

interface FinancialStateDbRow {
  singleton_id: number;
  capital_initial: string;
  expenses: JsonValue;
  menu_items: JsonValue;
  accounting_state: JsonValue;
  preferences: JsonValue;
  updated_at: Date;
}

function mapRow(row: FinancialStateDbRow): FinancialStateRow {
  return {
    singletonId: 1,
    capitalInitial: Number(row.capital_initial),
    expenses: row.expenses,
    menuItems: row.menu_items,
    accountingState: row.accounting_state,
    preferences: row.preferences,
    updatedAt: row.updated_at
  };
}

export const financialStateRepository: FinancialStatePort = {
  async getSingleton() {
    const { rows } = await query<FinancialStateDbRow>(
      "SELECT * FROM gestion_financial_state WHERE singleton_id = 1"
    );
    return rows[0] === undefined ? null : mapRow(rows[0]);
  },

  async upsertSingleton(state: FinancialStateData) {
    const { rows } = await query<FinancialStateDbRow>(
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
       RETURNING *`,
      [
        state.capitalInitial,
        // node-pg does NOT auto-serialize ARRAY params as json/jsonb values —
        // stringify explicitly so jsonb columns receive a JSON document.
        JSON.stringify(state.expenses),
        JSON.stringify(state.menuItems),
        JSON.stringify(state.accountingState),
        JSON.stringify(state.preferences)
      ]
    );
    return mapRow(rows[0]);
  }
};