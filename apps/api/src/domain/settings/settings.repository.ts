/**
 * Settings repository ports (domain slice, change `clean-arch-domain`).
 *
 * One interface per record root; children travel via roots only. Zero
 * implementations in `domain/`.
 */
import type { AuditLog, Category, FinancialState, FinancialStatePartial, FixedExpense, PromoSlide } from "./settings.js";

export interface FinancialStateRepository {
  load(): Promise<FinancialState>;
  save(state: FinancialState, partial: FinancialStatePartial): Promise<FinancialState>;
}

export interface FixedExpenseRepository {
  save(expense: FixedExpense): Promise<void>;
}

export interface PromoSlideRepository {
  listVisible(): Promise<readonly PromoSlide[]>;
}

export interface CategoryRepository {
  save(category: Category): Promise<void>;
}

export interface AuditLogRepository {
  append(log: AuditLog): Promise<void>;
}
