import { withTransaction, type TxClient as DriverClient } from "../../db/withTransaction.js";
import type {
  AuditLog,
  Category,
  FinancialState,
  FinancialStatePartial,
  FixedExpense,
  PromoSlide
} from "../../domain/settings/settings.js";
import type {
  AuditLogRepository,
  CategoryRepository,
  FinancialStateRepository,
  FixedExpenseRepository,
  PromoSlideRepository
} from "../../domain/settings/settings.repository.js";
import { mergeFinancialState } from "../../domain/settings/settings.js";
import { queryOn } from "./pg-session.adapter.js";
import {
  toDomainFinancialState,
  toDomainPromoSlide,
  type FinancialStateTableRow,
  type PromoSlideTableRow
} from "./pg-settings.mapper.js";

/**
 * Settings/drawer persistence (slice 4.1, change `clean-arch-infrastructure`).
 *
 * Driven adapters behind the domain settings ports (I2 pattern: domain
 * args first, optional caller `DriverClient` last — assignable to the
 * tx-free port signatures; without a client they open their own
 * transaction exactly like the legacy repositories). Financial, audit,
 * category and promo statements reuse the legacy
 * `modules/gestion|webshop/repositories` texts byte-identical; fixed
 * expenses are NEW keyed-JSON docs (`gestion.fixed-expenses.<id>`) with
 * the `invoice.settings` upsert shape (additive DELTA — no legacy
 * counterpart). `save` on the singleton merges absent-keep in the domain
 * (`mergeFinancialState`: negatives rejected 422) before the upsert.
 * Driver errors propagate untouched for the edge `toAppError` mapping.
 */
const FINANCIAL_GET_SQL = "SELECT * FROM gestion_financial_state WHERE singleton_id = 1";

const FINANCIAL_UPSERT_SQL =
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

const AUDIT_INSERT_SQL =
  `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
           SELECT u.id, $2::text, $3, $4, $5, $6::jsonb
           FROM (SELECT $1::uuid AS id) AS a LEFT JOIN users u ON u.id = a.id
           RETURNING id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at`;

const CATEGORY_CREATE_SQL =
  `INSERT INTO categories (id, name, code, description)
         VALUES ($1, $2, $3, '')
         RETURNING id, name, code, parent_id, is_active`;

const PROMO_LIST_SQL =
  `SELECT id, eyebrow, title, text, image, primary_label, primary_href,
              secondary_label, secondary_href, sort_order
       FROM promo_slides
       WHERE published = true
       ORDER BY sort_order ASC, created_at ASC`;

const FIXED_EXPENSE_UPSERT_SQL =
  `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING key, value`;

const FIXED_EXPENSE_KEY_PREFIX = "gestion.fixed-expenses.";

const ZERO_FINANCIAL: FinancialState = {
  singletonId: 1,
  capitalInitial: 0,
  expenses: [],
  menuItems: [],
  accountingState: {},
  preferences: {}
};

async function runOn<T>(client: DriverClient | undefined, fn: (tx: DriverClient) => Promise<T>): Promise<T> {
  return client !== undefined ? fn(client) : withTransaction(fn);
}

export class PgFinancialStateAdapter implements FinancialStateRepository {
  async load(client?: DriverClient): Promise<FinancialState> {
    const rows = await queryOn<FinancialStateTableRow>(client, FINANCIAL_GET_SQL, []);
    return rows[0] === undefined ? ZERO_FINANCIAL : toDomainFinancialState(rows[0]);
  }

  async save(state: FinancialState, partial: FinancialStatePartial, client?: DriverClient): Promise<FinancialState> {
    return runOn(client, async (tx) => {
      const current = await new PgFinancialStateAdapter().load(tx);
      const base = current.capitalInitial === 0 && state.capitalInitial !== 0 ? state : current;
      const merged = mergeFinancialState(base, partial);
      const rows = await queryOn<FinancialStateTableRow>(tx, FINANCIAL_UPSERT_SQL, [
        merged.capitalInitial,
        JSON.stringify(merged.expenses),
        JSON.stringify(merged.menuItems),
        JSON.stringify(merged.accountingState),
        JSON.stringify(merged.preferences)
      ]);
      return toDomainFinancialState(rows[0]);
    });
  }
}

export class PgFixedExpenseAdapter implements FixedExpenseRepository {
  async save(expense: FixedExpense, client?: DriverClient): Promise<void> {
    await queryOn(client, FIXED_EXPENSE_UPSERT_SQL, [
      FIXED_EXPENSE_KEY_PREFIX + expense.id,
      JSON.stringify(expense)
    ]);
  }
}

export class PgPromoSlideAdapter implements PromoSlideRepository {
  async listVisible(client?: DriverClient): Promise<readonly PromoSlide[]> {
    const rows = await queryOn<PromoSlideTableRow>(client, PROMO_LIST_SQL, []);
    return rows.map(toDomainPromoSlide);
  }
}

export class PgCategoryAdapter implements CategoryRepository {
  async save(category: Category, client?: DriverClient): Promise<void> {
    await queryOn(client, CATEGORY_CREATE_SQL, [category.id, category.name, category.code]);
  }
}

export class PgAuditLogAdapter implements AuditLogRepository {
  async append(log: AuditLog, client?: DriverClient): Promise<void> {
    await queryOn(client, AUDIT_INSERT_SQL, [
      null,
      null,
      log.action,
      log.entityType,
      log.entityId ?? null,
      JSON.stringify(log.details ?? {})
    ]);
  }
}
