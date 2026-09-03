import { describe, expect, it } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { orderSchema } from '@beim/contracts'
import { toOrderContract, toOrderItemsContract } from './order'

type OrderRow = Prisma.OrderGetPayload<true>
type OrderItemRow = Prisma.OrderItemGetPayload<true>

function prismaOrderItemRow(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: BigInt(12),
    orderId: 'order-1',
    productId: 'smartphone-premium',
    productCode: 1,
    productName: 'Smartphone premium',
    quantity: 3,
    unitPrice: new Decimal('35600'),
    currency: 'UYU',
    ...overrides,
  }
}

function prismaOrderRow(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'order-1',
    invoiceNumber: 100,
    userId: '3f2b7e9a-1d4c-4e8f-9a2b-6c5d4e3f2a1b',
    customer: 'Ana García',
    email: 'ana@example.com',
    phone: '59899123456',
    ci: '12345678',
    rut: null,
    paymentMethodId: '1',
    paymentMethodName: 'Tarjeta',
    paymentInstructions: 'Abonar en la tienda',
    paymentStatus: 'Pendiente_de_pago',
    paymentReceiptPath: 'uploads/receipts/1.pdf',
    paymentReceiptName: 'comprobante.pdf',
    paymentReviewedAt: new Date('2024-01-03T00:00:00Z'),
    stockCommitted: true,
    documentType: 'Factura',
    documentValue: 'F-123',
    address: 'Calle 1',
    shipping: 'Domicilio',
    comments: 'urgente',
    total: new Decimal('106800'),
    currency: 'UYU',
    status: 'Pendiente',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  }
}

describe('toOrderContract', () => {
  it('maps a fully populated order row to a valid Order contract', () => {
    const row = prismaOrderRow()
    const result = toOrderContract(row)
    expect(orderSchema.parse(result)).toEqual(result)
    expect(result.customer).toBe('Ana García')
    expect(result.id).toBe('order-1')
  })

  it('converts total Decimal to a plain number', () => {
    const result = toOrderContract(prismaOrderRow())
    expect(result.total).toBe(106800)
    expect(typeof result.total).toBe('number')
  })

  it('maps Prisma PaymentStatus values to contract values', () => {
    const pending = toOrderContract(prismaOrderRow({ paymentStatus: 'Pendiente_de_pago' }))
    expect(pending.paymentStatus).toBe('Pendiente de pago')

    for (const status of ['Pagado', 'Parcial', 'Rechazado'] as const) {
      const result = toOrderContract(prismaOrderRow({ paymentStatus: status }))
      expect(result.paymentStatus).toBe(status)
    }
  })

  it('omits null optional fields', () => {
    const row = prismaOrderRow({ rut: null, email: null, paymentReceiptPath: null })
    const result = toOrderContract(row)
    expect('rut' in result).toBe(false)
    expect('email' in result).toBe(false)
    expect('paymentReceiptPath' in result).toBe(false)
  })

  it('maps related items to OrderItem contracts', () => {
    const items = [prismaOrderItemRow()]
    const mapped = toOrderItemsContract(items)
    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toEqual({
      id: 12,
      orderId: 'order-1',
      productId: 'smartphone-premium',
      productCode: 1,
      productName: 'Smartphone premium',
      quantity: 3,
      unitPrice: 35600,
      currency: 'UYU',
    })
  })
})
