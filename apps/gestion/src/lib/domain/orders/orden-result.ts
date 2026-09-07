// Domain-local outcome types for order state transitions.
//
// The domain layer must not import server infrastructure (DIP: dependencies
// point inward, toward domain). These shapes are structural twins of the
// server Result/GestionError so use-cases consume them without adaptation.
// Only the error codes the pure rules can produce are listed here.

export const ORDER_ERROR_CODES = {
  CONFLICT: "CONFLICT"
} as const;

export type OrderErrorCode = (typeof ORDER_ERROR_CODES)[keyof typeof ORDER_ERROR_CODES];

export interface OrderErrorDetails {
  readonly [key: string]: unknown;
  readonly fields?: string[];
}

export interface OrderError {
  readonly code: OrderErrorCode;
  readonly message: string;
  readonly details?: OrderErrorDetails;
}

export type OrderResult<T, E extends OrderError = OrderError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): OrderResult<T> {
  return { ok: true, value };
}

export function err<E extends OrderError>(error: E): OrderResult<never> {
  return { ok: false, error };
}

const MESSAGE_BY_CODE: Readonly<Record<OrderErrorCode, string>> = {
  CONFLICT: "The operation conflicts with current state."
};

export function createOrderError(
  code: OrderErrorCode,
  details?: OrderErrorDetails,
  message: string = MESSAGE_BY_CODE[code]
): OrderError {
  return details === undefined ? { code, message } : { code, details, message };
}
