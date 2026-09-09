import { AppError } from "../../errors/AppError.js";
import { ERROR_CODES, type ErrorCode } from "../../errors/taxonomy.js";

/**
 * Domain error catalog (change `clean-arch-domain`, Phase 7).
 *
 * Violation → frozen taxonomy code + status table. Codes, messages, and
 * statuses stay frozen in `src/errors/taxonomy.ts` — this module only maps
 * domain violations to them and MUST NOT invent codes. Statuses reference
 * `ERROR_CODES` (never literals) so any taxonomy drift fails loudly here.
 *
 * Re-exports the taxonomy read-only so domain code imports it from the new
 * path; the legacy path keeps working untouched (removed at cutover, NOT
 * here). Framework-free: zero `express`/`pg`/SDK/I-O imports.
 */
export * from "../../errors/taxonomy.js";

export const CATALOG_VIOLATION = {
  INSUFFICIENT_STOCK: "insufficient-stock",
  DOUBLE_OPEN_CLOSE: "double-open-close",
  UNKNOWN_REFERENCE: "unknown-reference",
  INVALID_INPUT: "invalid-input",
  ILLEGAL_TRANSITION: "illegal-transition",
  INVALID_SIGNATURE: "invalid-signature",
  MISSING_SECRET: "missing-secret"
} as const;

export type CatalogViolation =
  (typeof CATALOG_VIOLATION)[keyof typeof CATALOG_VIOLATION];

export interface CatalogEntry {
  readonly violation: CatalogViolation;
  readonly code: ErrorCode;
  readonly status: number;
  readonly reason: string;
}

export const ERROR_CATALOG: Record<CatalogViolation, CatalogEntry> = {
  [CATALOG_VIOLATION.INSUFFICIENT_STOCK]: {
    violation: CATALOG_VIOLATION.INSUFFICIENT_STOCK,
    code: "INSUFFICIENT_STOCK",
    status: ERROR_CODES.INSUFFICIENT_STOCK,
    reason: "availableVenta/availableTaller shortfall on decrement/consume"
  },
  [CATALOG_VIOLATION.DOUBLE_OPEN_CLOSE]: {
    violation: CATALOG_VIOLATION.DOUBLE_OPEN_CLOSE,
    code: "CONFLICT",
    status: ERROR_CODES.CONFLICT,
    reason: "double cash-session open/close or second pending checkout"
  },
  [CATALOG_VIOLATION.UNKNOWN_REFERENCE]: {
    violation: CATALOG_VIOLATION.UNKNOWN_REFERENCE,
    code: "NOT_FOUND_OR_FORBIDDEN",
    status: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN,
    reason: "unknown product, order, receipt, or session at the edge"
  },
  [CATALOG_VIOLATION.INVALID_INPUT]: {
    violation: CATALOG_VIOLATION.INVALID_INPUT,
    code: "VALIDATION_ERROR",
    status: ERROR_CODES.VALIDATION_ERROR,
    reason: "negative price/stock/capital/opening, malformed uuid key, empty name/code"
  },
  // GAP: the frozen taxonomy has no dedicated transition code, so the closest
  // generic (VALIDATION_ERROR 422) applies. Kept explicit until taxonomy grows one.
  [CATALOG_VIOLATION.ILLEGAL_TRANSITION]: {
    violation: CATALOG_VIOLATION.ILLEGAL_TRANSITION,
    code: "VALIDATION_ERROR",
    status: ERROR_CODES.VALIDATION_ERROR,
    reason: "illegal repair-status transition (GAP: no dedicated code)"
  },
  [CATALOG_VIOLATION.INVALID_SIGNATURE]: {
    violation: CATALOG_VIOLATION.INVALID_SIGNATURE,
    code: "FORBIDDEN",
    status: ERROR_CODES.FORBIDDEN,
    reason: "invalid webhook signature"
  },
  [CATALOG_VIOLATION.MISSING_SECRET]: {
    violation: CATALOG_VIOLATION.MISSING_SECRET,
    code: "DEPENDENCY_UNAVAILABLE",
    status: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
    reason: "missing verification secret or unavailable dependency"
  }
} as const;

export function catalogEntryFor(violation: CatalogViolation): CatalogEntry {
  return ERROR_CATALOG[violation];
}

/**
 * Builds a frozen-taxonomy AppError for a cataloged violation. The edge
 * `toAppError` passes AppErrors through unchanged, preserving code + status.
 */
export function domainErrorFor(
  violation: CatalogViolation,
  message?: string,
  details?: unknown
): AppError {
  const entry = catalogEntryFor(violation);
  return new AppError(entry.code, message ?? entry.reason, entry.status, details);
}
