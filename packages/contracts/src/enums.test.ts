import { describe, expect, it } from 'vitest'
import { Currency, OrderStatus, PaymentStatus, StockMovementType, UserRole } from './enums'

describe('UserRole enum', () => {
  it('parses every valid legacy role value', () => {
    expect(UserRole.parse('cliente')).toBe('cliente')
    expect(UserRole.parse('admin')).toBe('admin')
    expect(UserRole.parse('superadmin')).toBe('superadmin')
  })

  it('rejects an invalid role value', () => {
    const result = UserRole.safeParse('invalid')
    expect(result.success).toBe(false)
  })
})

describe('Currency enum', () => {
  it('parses every valid legacy currency value', () => {
    expect(Currency.parse('UYU')).toBe('UYU')
    expect(Currency.parse('USD')).toBe('USD')
    expect(Currency.parse('USDT')).toBe('USDT')
  })

  it('rejects an invalid currency value', () => {
    const result = Currency.safeParse('EUR')
    expect(result.success).toBe(false)
  })
})

describe('OrderStatus enum', () => {
  it('parses every valid legacy order status value', () => {
    expect(OrderStatus.parse('Pendiente')).toBe('Pendiente')
    expect(OrderStatus.parse('Pagado')).toBe('Pagado')
    expect(OrderStatus.parse('Enviado')).toBe('Enviado')
    expect(OrderStatus.parse('Entregado')).toBe('Entregado')
    expect(OrderStatus.parse('Cancelado')).toBe('Cancelado')
  })

  it('rejects an invalid order status value', () => {
    const result = OrderStatus.safeParse('Unknown')
    expect(result.success).toBe(false)
  })
})

describe('PaymentStatus enum', () => {
  it('parses every valid legacy payment status value', () => {
    expect(PaymentStatus.parse('Pendiente de pago')).toBe('Pendiente de pago')
    expect(PaymentStatus.parse('Pagado')).toBe('Pagado')
    expect(PaymentStatus.parse('Parcial')).toBe('Parcial')
    expect(PaymentStatus.parse('Rechazado')).toBe('Rechazado')
  })

  it('rejects an invalid payment status value', () => {
    const result = PaymentStatus.safeParse('Aprobado')
    expect(result.success).toBe(false)
  })
})

describe('StockMovementType enum', () => {
  it('parses every valid legacy stock movement type value', () => {
    expect(StockMovementType.parse('sale')).toBe('sale')
    expect(StockMovementType.parse('purchase')).toBe('purchase')
    expect(StockMovementType.parse('return')).toBe('return')
    expect(StockMovementType.parse('adjustment')).toBe('adjustment')
    expect(StockMovementType.parse('sale_annulment')).toBe('sale_annulment')
    expect(StockMovementType.parse('purchase_annulment')).toBe('purchase_annulment')
    expect(StockMovementType.parse('web_transfer_out')).toBe('web_transfer_out')
    expect(StockMovementType.parse('web_transfer_in')).toBe('web_transfer_in')
    expect(StockMovementType.parse('initial_stock')).toBe('initial_stock')
    expect(StockMovementType.parse('service_order_sale')).toBe('service_order_sale')
    expect(StockMovementType.parse('service_order_return')).toBe('service_order_return')
  })

  it('rejects an invalid stock movement type value', () => {
    const result = StockMovementType.safeParse('invalid_type')
    expect(result.success).toBe(false)
  })

  it('rejects transfer (not a legacy value — use web_transfer_out/in)', () => {
    const result = StockMovementType.safeParse('transfer')
    expect(result.success).toBe(false)
  })
})
