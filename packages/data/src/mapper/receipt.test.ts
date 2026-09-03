import { describe, expect, it } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { toReceiptContract } from './receipt'

type BeimReceiptRow = Prisma.BeimReceiptGetPayload<true>

function prismaReceiptRow(overrides: Partial<BeimReceiptRow> = {}): BeimReceiptRow {
  return {
    id: 'receipt-1',
    receiptNumber: 42,
    userId: '3f2b7e9a-1d4c-4e8f-9a2b-6c5d4e3f2a1b',
    repairStatus: 'En reparación',
    clientName: 'Juan Pérez',
    clientId: 'client-1',
    clientPhone: '59899111222',
    deviceBrand: 'Samsung',
    deviceModel: 'Galaxy S24',
    deviceColor: 'Negro',
    imeiSerial: '123456789012345',
    assignedTechnicianId: 'tech-1',
    diagnosticNotes: 'Pantalla rota',
    quoteStatus: 'Aprobado',
    quoteTotal: new Decimal('15000'),
    quoteSentAt: new Date('2024-01-10T10:00:00Z'),
    quoteApprovedAt: new Date('2024-01-11T10:00:00Z'),
    qaStatus: 'Pendiente',
    qaCompletedAt: null,
    warrantyStartsAt: null,
    warrantyEndsAt: null,
    invoiceNumber: 'F-042',
    paymentStatus: 'Pendiente',
    services: ['Cambio de pantalla'],
    reportedIssue: 'Pantalla rota',
    visualItems: ['Golpe en esquina'],
    entryDateText: '2024-01-10',
    deliveryTime: '48h',
    deliveryUnit: 'horas',
    warrantyOffered: '90 días',
    price: '$ 15.000 UYU',
    unlockCode: '',
    unlockPassword: '',
    unlockPattern: '',
    terms: 'Garantía limitada',
    payload: { saleId: 'sale-1' },
    createdAt: new Date('2024-01-10T08:00:00Z'),
    updatedAt: new Date('2024-01-12T08:00:00Z'),
    ...overrides,
  }
}

describe('toReceiptContract', () => {
  it('maps a fully populated receipt row to a valid BeimReceipt', () => {
    const row = prismaReceiptRow()
    const result = toReceiptContract(row)
    expect(result.id).toBe('receipt-1')
    expect(result.number).toBe(42)
    expect(result.status).toBe('En reparación')
    expect(result.clientName).toBe('Juan Pérez')
    expect(result.deviceBrand).toBe('Samsung')
  })

  it('parses text price via parseBeimMoney', () => {
    const result = toReceiptContract(prismaReceiptRow({ price: '$ 15.000 UYU' }))
    expect(result.price).toBe(15000)
    expect(typeof result.price).toBe('number')
  })

  it('returns 0 for empty price', () => {
    const result = toReceiptContract(prismaReceiptRow({ price: '' }))
    expect(result.price).toBe(0)
  })

  it('passes through the payload JSON', () => {
    const payload = { saleId: 'sale-1', items: [{ qty: 2 }] }
    const result = toReceiptContract(prismaReceiptRow({ payload }))
    expect(result.payload).toEqual(payload)
  })

  it('maps null nullable fields to undefined', () => {
    const result = toReceiptContract(
      prismaReceiptRow({ userId: null, assignedTechnicianId: null }),
    )
    expect(result.userId).toBeUndefined()
    expect(result.assignedTechnicianId).toBeUndefined()
  })

  it('maps related parts', () => {
    const parts = [{
      id: 'part-1',
      receiptId: 'receipt-1',
      productId: 'product-1',
      quantity: 2,
      unitCost: 5000,
      unitPrice: 7000,
      warrantyDays: 30,
      supplierName: 'Supplier X',
      stockDecremented: false,
      notes: '',
      createdAt: new Date('2024-01-10T08:00:00Z'),
    }] as unknown as Prisma.BeimReceiptPartGetPayload<true>[]

    const result = toReceiptContract(prismaReceiptRow(), { parts })
    expect(result.parts).toHaveLength(1)
    const part = result.parts[0]
    expect(part?.id).toBe('part-1')
    expect(part?.unitPrice).toBe(7000)
  })

  it('maps related payments', () => {
    const payments = [{
      id: 'pay-1',
      receiptId: 'receipt-1',
      amount: 15000,
      currency: 'UYU',
      method: 'Efectivo',
      reference: '',
      notes: '',
      createdBy: 'user-1',
      createdAt: new Date('2024-01-12T08:00:00Z'),
    }] as unknown as Prisma.BeimReceiptPaymentGetPayload<true>[]

    const result = toReceiptContract(prismaReceiptRow(), { payments })
    expect(result.payments).toHaveLength(1)
    const payment = result.payments[0]
    expect(payment?.amount).toBe(15000)
    expect(payment?.method).toBe('Efectivo')
  })

  it('defaults related arrays to empty when not provided', () => {
    const result = toReceiptContract(prismaReceiptRow())
    expect(result.parts).toEqual([])
    expect(result.payments).toEqual([])
    expect(result.checklists).toEqual([])
  })
})
