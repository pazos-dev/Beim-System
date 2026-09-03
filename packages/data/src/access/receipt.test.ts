import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    beimReceipt: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import { getReceiptById, searchReceipts, createReceipt, updateReceipt } from './receipt'

const mockReceipt = {
  id: 'receipt-1',
  receiptNumber: 42,
  userId: null,
  repairStatus: 'En reparación',
  clientName: 'Juan Pérez',
  clientId: 'client-1',
  clientPhone: '59899111222',
  deviceBrand: 'Samsung',
  deviceModel: 'Galaxy S24',
  deviceColor: 'Negro',
  imeiSerial: '123456789012345',
  assignedTechnicianId: null,
  diagnosticNotes: 'Pantalla rota',
  quoteStatus: 'Aprobado',
  quoteTotal: new Decimal('15000'),
  quoteSentAt: null,
  quoteApprovedAt: null,
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
} satisfies Prisma.BeimReceiptGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getReceiptById', () => {
  it('returns a receipt with related data', async () => {
    vi.mocked(prisma.beimReceipt.findUnique).mockResolvedValue({
      ...mockReceipt,
      parts: [],
      payments: [],
      checklists: [],
    } as unknown as Prisma.BeimReceiptGetPayload<{ include: { parts: true; payments: true; checklists: true } }>)
    const result = await getReceiptById('receipt-1')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('receipt-1')
    expect(result!.number).toBe(42)
    expect(result!.price).toBe(15000)
    expect(result!.parts).toEqual([])
  })

  it('returns null when not found', async () => {
    vi.mocked(prisma.beimReceipt.findUnique).mockResolvedValue(null)
    const result = await getReceiptById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('searchReceipts', () => {
  it('searches by client name', async () => {
    vi.mocked(prisma.beimReceipt.findMany).mockResolvedValue([{
      ...mockReceipt,
      parts: [],
      payments: [],
      checklists: [],
    }] as unknown as Prisma.BeimReceiptGetPayload<{ include: { parts: true; payments: true; checklists: true } }>[])
    const result = await searchReceipts('Juan')
    expect(result).toHaveLength(1)
    expect(prisma.beimReceipt.findMany).toHaveBeenCalledOnce()
  })
})

describe('createReceipt', () => {
  it('creates a new receipt', async () => {
    vi.mocked(prisma.beimReceipt.create).mockResolvedValue(mockReceipt as Prisma.BeimReceiptGetPayload<true>)
    const result = await createReceipt({
      receiptNumber: 42,
      clientName: 'Juan Pérez',
      price: '$ 15.000 UYU',
    })
    expect(result.number).toBe(42)
    expect(result.clientName).toBe('Juan Pérez')
    expect(prisma.beimReceipt.create).toHaveBeenCalledOnce()
  })
})

describe('updateReceipt', () => {
  it('updates an existing receipt', async () => {
    vi.mocked(prisma.beimReceipt.update).mockResolvedValue({
      ...mockReceipt,
      repairStatus: 'Entregado',
    } as Prisma.BeimReceiptGetPayload<true>)
    const result = await updateReceipt('receipt-1', { repairStatus: 'Entregado' })
    expect(result.status).toBe('Entregado')
    expect(prisma.beimReceipt.update).toHaveBeenCalledOnce()
  })
})
