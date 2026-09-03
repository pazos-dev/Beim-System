import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from '../domain-error'
import {
  validateOrderStatus,
  isFinishedOrderStatus,
  applyFinishedTimestamp,
  deriveRepairStatusFromServiceItems,
} from './status'

describe('validateOrderStatus', () => {
  it('accepts a valid status without throwing', () => {
    expect(() => validateOrderStatus('Pagado')).not.toThrow()
  })

  it('accepts all five valid statuses', () => {
    for (const status of ['Pendiente', 'Pagado', 'Enviado', 'Entregado', 'Cancelado']) {
      expect(() => validateOrderStatus(status)).not.toThrow()
    }
  })

  it('throws DomainError for an invalid status', () => {
    expect(() => validateOrderStatus('Desconocido')).toThrow(DomainError)
  })

  it('throws with INVALID_STATUS code', () => {
    try {
      validateOrderStatus('Desconocido')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.INVALID_STATUS)
    }
  })

  it('rejects empty string', () => {
    expect(() => validateOrderStatus('')).toThrow(DomainError)
  })
})

describe('isFinishedOrderStatus', () => {
  it('returns true for Entregado', () => {
    expect(isFinishedOrderStatus('Entregado')).toBe(true)
  })

  it('returns true for Cancelado', () => {
    expect(isFinishedOrderStatus('Cancelado')).toBe(true)
  })

  it('returns true for Finalizado', () => {
    expect(isFinishedOrderStatus('Finalizado')).toBe(true)
  })

  it('returns false for Pendiente', () => {
    expect(isFinishedOrderStatus('Pendiente')).toBe(false)
  })

  it('returns false for Pagado', () => {
    expect(isFinishedOrderStatus('Pagado')).toBe(false)
  })

  it('returns false for Enviado', () => {
    expect(isFinishedOrderStatus('Enviado')).toBe(false)
  })
})

describe('applyFinishedTimestamp', () => {
  it('sets finishedAt when entering a finished status', () => {
    const order = { finishedAt: '' }
    const now = '2026-01-15T10:00:00Z'
    const result = applyFinishedTimestamp(order, 'Entregado', now)
    expect(result.finishedAt).toBe('2026-01-15T10:00:00Z')
  })

  it('clears finishedAt when leaving a finished status', () => {
    const order = { finishedAt: '2026-01-01T10:00:00Z' }
    const now = '2026-01-15T10:00:00Z'
    const result = applyFinishedTimestamp(order, 'Presupuestado', now)
    expect(result.finishedAt).toBe('')
  })

  it('does not mutate the original order', () => {
    const order = { finishedAt: '' }
    const now = '2026-01-15T10:00:00Z'
    applyFinishedTimestamp(order, 'Entregado', now)
    expect(order.finishedAt).toBe('')
  })

  it('sets finishedAt for Cancelado', () => {
    const order = { finishedAt: '' }
    const now = '2026-02-01T08:00:00Z'
    const result = applyFinishedTimestamp(order, 'Cancelado', now)
    expect(result.finishedAt).toBe('2026-02-01T08:00:00Z')
  })

  it('sets finishedAt for Finalizado', () => {
    const order = { finishedAt: '' }
    const now = '2026-03-01T12:00:00Z'
    const result = applyFinishedTimestamp(order, 'Finalizado', now)
    expect(result.finishedAt).toBe('2026-03-01T12:00:00Z')
  })
})

describe('deriveRepairStatusFromServiceItems', () => {
  it('returns Presupuestado when items array is empty', () => {
    expect(deriveRepairStatusFromServiceItems([])).toBe('Presupuestado')
  })

  it('returns Esperando aprobacion when any item has Pendiente status', () => {
    const items = [
      { approvalStatus: 'Pendiente' },
      { approvalStatus: 'Aprobado' },
    ]
    expect(deriveRepairStatusFromServiceItems(items)).toBe('Esperando aprobacion')
  })

  it('returns Aprobado when all items are Aprobado', () => {
    const items = [{ approvalStatus: 'Aprobado' }]
    expect(deriveRepairStatusFromServiceItems(items)).toBe('Aprobado')
  })

  it('returns Presupuestado when all items are No aprobado', () => {
    const items = [{ approvalStatus: 'No aprobado' }]
    expect(deriveRepairStatusFromServiceItems(items)).toBe('Presupuestado')
  })

  it('returns Presupuestado for mixed non-pending statuses', () => {
    const items = [
      { approvalStatus: 'Aprobado' },
      { approvalStatus: 'No aprobado' },
    ]
    expect(deriveRepairStatusFromServiceItems(items)).toBe('Presupuestado')
  })
})
