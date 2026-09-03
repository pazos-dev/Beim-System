/**
 * Domain error raised by pure domain functions when a business rule is
 * violated. Carries a stable, machine-readable `code` in addition to a
 * human-readable `message`, keeping legacy error semantics while enabling
 * typed handling in the application layer.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

/**
 * Stable error codes emitted by domain functions. Values are immutable
 * identifiers used to map errors back to legacy messages for retro-compat.
 */
export const ErrorCodes = {
  INVALID_STATUS: 'INVALID_STATUS',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  STOCK_COMMITTED: 'STOCK_COMMITTED',
  ANNULMENT_REASON_REQUIRED: 'ANNULMENT_REASON_REQUIRED',
  DUPLICATE_ANNULMENT: 'DUPLICATE_ANNULMENT',
  INVALID_TRANSFER_SOURCE: 'INVALID_TRANSFER_SOURCE',
  CLIENT_NAME_REQUIRED: 'CLIENT_NAME_REQUIRED',
  INVALID_PURCHASE: 'INVALID_PURCHASE',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
