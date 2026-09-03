/**
 * Order status helpers — pure functions for validating status transitions,
 * detecting finished states, managing the finishedAt timestamp, and deriving
 * repair status from service items. Ported from legacy validateOrderStatus
 * and normalizeGestionRepairStatus in pagina-web/server.js.
 */

import { DomainError, ErrorCodes } from '../domain-error'

/** The five valid order statuses matching the contracts enum. */
const VALID_ORDER_STATUSES = [
  'Pendiente',
  'Pagado',
  'Enviado',
  'Entregado',
  'Cancelado',
] as const

/** Statuses that indicate the order has reached a terminal state. */
const FINISHED_STATUSES = ['Finalizado', 'Entregado', 'Cancelado'] as const

/**
 * Validates that a status string is one of the five legal order statuses.
 * Throws `DomainError` with `INVALID_STATUS` for anything else.
 */
export function validateOrderStatus(status: string): void {
  if (!(VALID_ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new DomainError(
      ErrorCodes.INVALID_STATUS,
      'El estado del pedido no es válido.',
    )
  }
}

/**
 * Returns `true` when `status` represents a finished (terminal) order.
 */
export function isFinishedOrderStatus(status: string): boolean {
  return (FINISHED_STATUSES as readonly string[]).includes(status)
}

/**
 * Returns a new order object with `finishedAt` set or cleared based on
 * whether `newStatus` is a finished status. The `now` argument is injected
 * — pure functions never call `new Date()` directly.
 */
export function applyFinishedTimestamp<
  T extends { finishedAt: string },
>(order: T, newStatus: string, now: string): T {
  if (isFinishedOrderStatus(newStatus)) {
    return { ...order, finishedAt: now }
  }
  return { ...order, finishedAt: '' }
}

/**
 * Derives the repair status from the aggregate approval statuses of the
 * service items. Priority:
 *   - empty list → `Presupuestado`
 *   - any `Pendiente` → `Esperando aprobacion`
 *   - all `Aprobado` → `Aprobado`
 *   - otherwise → `Presupuestado`
 */
export function deriveRepairStatusFromServiceItems(
  items: ReadonlyArray<{ approvalStatus: string }>,
): string {
  if (items.length === 0) return 'Presupuestado'

  const hasPendiente = items.some((i) => i.approvalStatus === 'Pendiente')
  if (hasPendiente) return 'Esperando aprobacion'

  const allAprobado = items.every((i) => i.approvalStatus === 'Aprobado')
  if (allAprobado) return 'Aprobado'

  return 'Presupuestado'
}
