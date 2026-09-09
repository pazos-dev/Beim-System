import type {
  AuditLog,
  Category,
  FinancialState,
  FixedExpense,
  JsonValue,
  PromoSlide
} from "../../domain/settings/settings.js";

/**
 * Settings row mappings (slice 4.1, change `clean-arch-infrastructure`).
 *
 * Snake_case rows become domain records; numeric capitals arrive as
 * strings and jsonb columns pass through unchanged. The promo mapper
 * marks `published: true` — unpublished rows never leave the adapter
 * (the legacy `WHERE published = true` filters them in SQL). Category
 * and audit writes return void, so no row crosses back for them.
 */
export interface FinancialStateTableRow {
  singleton_id: number;
  capital_initial: string;
  expenses: JsonValue;
  menu_items: JsonValue;
  accounting_state: JsonValue;
  preferences: JsonValue;
  updated_at: Date;
}

export function toDomainFinancialState(row: FinancialStateTableRow): FinancialState {
  return {
    singletonId: 1,
    capitalInitial: Number(row.capital_initial),
    expenses: row.expenses,
    menuItems: row.menu_items,
    accountingState: row.accounting_state as FinancialState["accountingState"],
    preferences: row.preferences
  };
}

export interface PromoSlideTableRow {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  image: string;
  primary_label: string | null;
  primary_href: string | null;
  secondary_label: string | null;
  secondary_href: string | null;
  sort_order: number;
}

export function toDomainPromoSlide(row: PromoSlideTableRow): PromoSlide {
  return { id: row.id, sortOrder: row.sort_order, published: true, title: row.title, image: row.image };
}

export type { AuditLog, Category, FinancialState, FixedExpense, PromoSlide };
