/**
 * @beim/domain — pure domain services barrel.
 *
 * Re-exports all domain use cases, error primitives, and area modules:
 * `DomainError`/`ErrorCodes`, and the order, payment, stock, and client
 * service collections.
 */

export { DomainError, ErrorCodes } from './domain-error'
export type { ErrorCode } from './domain-error'

export * from './order'
export * from './payment'
export * from './stock'
export * from './client'
