import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    gestionStockMovement: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import { listStockMovements } from './stock-movement'

const mockMovement = {
  id: BigInt(7),
  productId: 'smartphone-premium',
  movementType: 'sale' as const,
  quantity: -2,
  balanceAfter: 8,
  referenceType: 'Order',
  referenceId: 'order-1',
  detail: 'Venta',
  createdAt: new Date('2024-01-01T00:00:00Z'),
} satisfies Prisma.GestionStockMovementGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listStockMovements', () => {
  it('returns all movements without filter', async () => {
    vi.mocked(prisma.gestionStockMovement.findMany).mockResolvedValue([mockMovement])
    const result = await listStockMovements()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe(7)
    expect(result[0]!.movementType).toBe('sale')
  })

  it('filters by productId when provided', async () => {
    vi.mocked(prisma.gestionStockMovement.findMany).mockResolvedValue([mockMovement])
    const result = await listStockMovements('smartphone-premium')
    expect(result).toHaveLength(1)
    expect(prisma.gestionStockMovement.findMany).toHaveBeenCalledWith({
      where: { productId: 'smartphone-premium' },
      orderBy: { createdAt: 'desc' },
    })
  })

  it('returns empty array when no movements exist', async () => {
    vi.mocked(prisma.gestionStockMovement.findMany).mockResolvedValue([])
    const result = await listStockMovements()
    expect(result).toEqual([])
  })
})
