import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import { listOrders, getOrderById, createOrder, updateOrder } from './order'

const mockOrder = {
  id: 'order-1',
  invoiceNumber: 100,
  userId: null,
  customer: 'Ana García',
  email: null,
  phone: null,
  ci: null,
  rut: null,
  paymentMethodId: null,
  paymentMethodName: null,
  paymentInstructions: null,
  paymentStatus: 'Pendiente_de_pago' as const,
  paymentReceiptPath: null,
  paymentReceiptName: null,
  paymentReviewedAt: null,
  stockCommitted: false,
  documentType: null,
  documentValue: null,
  address: null,
  shipping: null,
  comments: null,
  total: new Decimal('106800'),
  currency: 'UYU' as const,
  status: 'Pendiente' as const,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
} satisfies Prisma.OrderGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listOrders', () => {
  it('returns all orders', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([mockOrder])
    const result = await listOrders()
    expect(result).toHaveLength(1)
    expect(result[0]!.total).toBe(106800)
  })

  it('filters by status when provided', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([mockOrder])
    const result = await listOrders('Pendiente')
    expect(result).toHaveLength(1)
    expect(prisma.order.findMany).toHaveBeenCalledWith({ where: { status: 'Pendiente' } })
  })
})

describe('getOrderById', () => {
  it('returns an order by ID', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(mockOrder)
    const result = await getOrderById('order-1')
    expect(result).not.toBeNull()
    expect(result!.customer).toBe('Ana García')
  })

  it('returns null when not found', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)
    const result = await getOrderById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('createOrder', () => {
  it('creates a new order', async () => {
    vi.mocked(prisma.order.create).mockResolvedValue(mockOrder)
    const result = await createOrder({
      customer: 'Ana García',
      total: 106800,
    })
    expect(result.customer).toBe('Ana García')
    expect(prisma.order.create).toHaveBeenCalledOnce()
  })
})

describe('updateOrder', () => {
  it('updates an existing order', async () => {
    vi.mocked(prisma.order.update).mockResolvedValue({ ...mockOrder, status: 'Pagado' })
    const result = await updateOrder('order-1', { status: 'Pagado' })
    expect(result.status).toBe('Pagado')
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { status: 'Pagado' } })
  })
})
