import { describe, expect, it } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { Prisma } from '@prisma/client'
import { serviceSchema } from '@beim/contracts'
import { toServiceContract } from './service'

type ServiceRow = Prisma.GestionServiceGetPayload<true>

function prismaServiceRow(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
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
    ...overrides,
  }
}

describe('toServiceContract', () => {
  it('maps a fully populated row to a valid Service contract', () => {
    const result = toServiceContract(prismaServiceRow())
    expect(serviceSchema.parse(result)).toEqual(result)
    expect(result.name).toBe('Cambio de pantalla')
    expect(result.categoryName).toBe('Reparación')
  })

  it('converts Decimal costPrice and salePrice to numbers', () => {
    const result = toServiceContract(prismaServiceRow())
    expect(result.costPrice).toBe(1500)
    expect(typeof result.costPrice).toBe('number')
    expect(result.salePrice).toBe(3200)
    expect(typeof result.salePrice).toBe('number')
  })

  it('omits optional text fields that are empty strings', () => {
    const result = toServiceContract(
      prismaServiceRow({ durationText: '', warrantyText: '', notes: '', productKey: '', brand: '' }),
    )
    expect('durationText' in result).toBe(false)
    expect('warrantyText' in result).toBe(false)
    expect('notes' in result).toBe(false)
    expect('productKey' in result).toBe(false)
    expect('brand' in result).toBe(false)
  })

  it('keeps bool active field', () => {
    expect(toServiceContract(prismaServiceRow()).active).toBe(true)
    expect(toServiceContract(prismaServiceRow({ active: false })).active).toBe(false)
  })
})
