// Domain-local outcome types for inventory planning rules.
//
// The domain layer must not import server infrastructure (DIP: dependencies
// point inward, toward domain). These shapes are structural twins of the
// server Result/GestionError so use-cases consume them without adaptation.
// Only the error codes the pure rules can produce are listed here.

export const INVENTORY_ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CONFLICT: "CONFLICT",
  STORAGE_ERROR: "STORAGE_ERROR"
} as const;

export type InventoryErrorCode = (typeof INVENTORY_ERROR_CODES)[keyof typeof INVENTORY_ERROR_CODES];

export interface InventoryErrorDetails {
  readonly [key: string]: unknown;
  readonly fields?: string[];
}

export interface InventoryError {
  readonly code: InventoryErrorCode;
  readonly message: string;
  readonly details?: InventoryErrorDetails;
}

export type InventoryResult<T, E extends InventoryError = InventoryError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): InventoryResult<T> {
  return { ok: true, value };
}

export function err<E extends InventoryError>(error: E): InventoryResult<never> {
  return { ok: false, error };
}

const MESSAGE_BY_CODE: Readonly<Record<InventoryErrorCode, string>> = {
  VALIDATION_ERROR: "Invalid payload.",
  CONFLICT: "The operation conflicts with current state.",
  STORAGE_ERROR: "Storage could not be reached."
};

export function createInventoryError(
  code: InventoryErrorCode,
  details?: InventoryErrorDetails,
  message: string = MESSAGE_BY_CODE[code]
): InventoryError {
  return details === undefined ? { code, message } : { code, details, message };
}
