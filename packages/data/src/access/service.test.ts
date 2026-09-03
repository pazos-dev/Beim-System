import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    gestionService: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    gestionServiceCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import {
  listServices,
  upsertService,
  deleteService,
  listServiceCategories,
  upsertServiceCategory,
  deleteServiceCategory,
} from './service'

const mockService = {
  id: 'servicio-1',
  categoryName: 'Reparación',
  name: 'Cambio de pantalla',
  costPrice: new Decimal('1500'),
  salePrice: new Decimal('3200'),
  durationText: '2 horas',
  warrantyText: '90 días',
  notes: 'Incluye diagnóstico',
  productKey: 'serv',
  productName: 'iPhone 16',
  brand: 'Apple',
  model: '16',
  active: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
} satisfies Prisma.GestionServiceGetPayload<true>

const mockServiceCategory = {
  id: 'cat-1',
  name: 'Reparación',
  createdAt: new Date('2024-01-01T00:00:00Z'),
} satisfies Prisma.GestionServiceCategoryGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listServices', () => {
  it('returns all services', async () => {
    vi.mocked(prisma.gestionService.findMany).mockResolvedValue([mockService])
    const result = await listServices()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Cambio de pantalla')
    expect(result[0]!.costPrice).toBe(1500)
  })
})

describe('upsertService', () => {
  it('creates a new service', async () => {
    vi.mocked(prisma.gestionService.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.gestionService.create).mockResolvedValue(mockService)
    const result = await upsertService({ id: 'servicio-1', name: 'Cambio de pantalla' })
    expect(result.name).toBe('Cambio de pantalla')
    expect(prisma.gestionService.create).toHaveBeenCalledOnce()
  })

  it('updates an existing service', async () => {
    vi.mocked(prisma.gestionService.findUnique).mockResolvedValue(mockService)
    vi.mocked(prisma.gestionService.update).mockResolvedValue({ ...mockService, name: 'Updated' })
    const result = await upsertService({ id: 'servicio-1', name: 'Updated' })
    expect(result.name).toBe('Updated')
    expect(prisma.gestionService.update).toHaveBeenCalledOnce()
  })
})

describe('deleteService', () => {
  it('deletes a service by ID', async () => {
    vi.mocked(prisma.gestionService.delete).mockResolvedValue(mockService)
    await deleteService('servicio-1')
    expect(prisma.gestionService.delete).toHaveBeenCalledWith({ where: { id: 'servicio-1' } })
  })
})

describe('listServiceCategories', () => {
  it('returns all service categories', async () => {
    vi.mocked(prisma.gestionServiceCategory.findMany).mockResolvedValue([mockServiceCategory])
    const result = await listServiceCategories()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Reparación')
  })
})

describe('upsertServiceCategory', () => {
  it('creates a new service category', async () => {
    vi.mocked(prisma.gestionServiceCategory.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.gestionServiceCategory.create).mockResolvedValue(mockServiceCategory)
    const result = await upsertServiceCategory({ id: 'cat-1', name: 'Reparación' })
    expect(result.name).toBe('Reparación')
    expect(prisma.gestionServiceCategory.create).toHaveBeenCalledOnce()
  })

  it('updates an existing service category', async () => {
    vi.mocked(prisma.gestionServiceCategory.findUnique).mockResolvedValue(mockServiceCategory)
    vi.mocked(prisma.gestionServiceCategory.update).mockResolvedValue({ ...mockServiceCategory, name: 'Updated' })
    const result = await upsertServiceCategory({ id: 'cat-1', name: 'Updated' })
    expect(result.name).toBe('Updated')
    expect(prisma.gestionServiceCategory.update).toHaveBeenCalledOnce()
  })
})

describe('deleteServiceCategory', () => {
  it('deletes a service category by ID', async () => {
    vi.mocked(prisma.gestionServiceCategory.delete).mockResolvedValue(mockServiceCategory)
    await deleteServiceCategory('cat-1')
    expect(prisma.gestionServiceCategory.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } })
  })
})
