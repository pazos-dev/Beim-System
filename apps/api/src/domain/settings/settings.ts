/**
 * Settings / Finance drawer records (domain slice, `clean-arch-domain` 6.3).
 *
 * Plain records behind repository ports (`domain-entities.md` v3 §9): no
 * aggregate ceremony, no cross-entry invariants. `FinancialState` is the
 * singleton id 1 with partial `merge` (absent fields kept; negative capital
 * or opening balances rejected). Framework-free. No DDL/SQL.
 */
import { ValidationError } from "../shared/errors.js";

export type JsonValue = Readonly<Record<string, unknown>> | readonly unknown[] | string | number | boolean | null;

export interface FinancialState {
  readonly singletonId: 1;
  readonly capitalInitial: number;
  readonly expenses?: JsonValue;
  readonly menuItems?: JsonValue;
  readonly accountingState?: { readonly openingBalances?: number } & Readonly<Record<string, unknown>>;
  readonly preferences?: JsonValue;
}

export type FinancialStatePartial = Partial<Omit<FinancialState, "singletonId">>;

/** Partial merge: absent fields kept; negatives rejected 422. Pure copy. */
export function mergeFinancialState(current: FinancialState, partial: FinancialStatePartial): FinancialState {
  const next: FinancialState = { ...current, ...stripUndefined(partial), singletonId: 1 };
  if (!Number.isFinite(next.capitalInitial) || next.capitalInitial < 0) {
    throw new ValidationError("Estado financiero inválido: capitalInitial debe ser >= 0", {
      capitalInitial: next.capitalInitial
    });
  }
  const opening = next.accountingState?.openingBalances;
  if (opening !== undefined && (!Number.isFinite(opening) || opening < 0)) {
    throw new ValidationError("Estado financiero inválido: openingBalances debe ser >= 0", { opening });
  }
  return next;
}

function stripUndefined(partial: FinancialStatePartial): FinancialStatePartial {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) out[key] = value;
  }
  return out as FinancialStatePartial;
}

export interface FixedExpense {
  readonly id: string;
  readonly userId: string | null;
  readonly expenseMonth: string;
  readonly categoryName: string;
  readonly amount: number;
  readonly notes: string | null;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function createFixedExpense(input: {
  id: string;
  userId?: string;
  expenseMonth: string;
  categoryName: string;
  amount: number;
  notes?: string;
}): FixedExpense {
  if (input.id.trim() === "" || input.categoryName.trim() === "") {
    throw new ValidationError("Gasto fijo inválido: id y categoryName son requeridos", {});
  }
  if (!MONTH_PATTERN.test(input.expenseMonth)) {
    throw new ValidationError("Gasto fijo inválido: expenseMonth debe ser YYYY-MM", { expenseMonth: input.expenseMonth });
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new ValidationError("Gasto fijo inválido: amount debe ser >= 0", { amount: input.amount });
  }
  return { id: input.id, userId: input.userId ?? null, expenseMonth: input.expenseMonth, categoryName: input.categoryName, amount: input.amount, notes: input.notes ?? null };
}

export interface PromoSlide {
  readonly id: string;
  readonly sortOrder: number;
  readonly published: boolean;
  readonly title?: string;
  readonly image?: string;
}

/** Published-only visibility in defined sort order; pure copy. */
export function sortPromoSlides(slides: readonly PromoSlide[]): readonly PromoSlide[] {
  return [...slides].filter((s) => s.published).sort((a, b) => a.sortOrder - b.sortOrder);
}

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly parentId: string | null;
}

export function createCategory(input: { id: string; name: string; code: string; description?: string; parentId?: string }): Category {
  if (input.id.trim() === "" || input.name.trim() === "" || input.code.trim() === "") {
    throw new ValidationError("Categoría inválida: name y code son requeridos", {});
  }
  return { id: input.id, name: input.name, code: input.code, description: input.description ?? null, parentId: input.parentId ?? null };
}

export interface AuditLog {
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly details: JsonValue;
}

export function createAuditLog(input: { action: string; entityType: string; entityId?: string; details?: JsonValue }): AuditLog {
  if (input.action.trim() === "" || input.entityType.trim() === "") {
    throw new ValidationError("Auditoría inválida: action y entityType son requeridos", {});
  }
  return { action: input.action, entityType: input.entityType, entityId: input.entityId ?? null, details: input.details ?? null };
}
