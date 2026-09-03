import { describe, expect, it } from 'vitest'
import { serviceSchema, type Service } from './service'

function validService(): Service {
  return {
    id: 'service-001',
    categoryName: 'Reparación',
    name: 'Cambio de batería',
    costPrice: 150.5,
    salePrice: 350,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('serviceSchema', () => {
  it('parses a valid service with money fields', () => {
    const service = serviceSchema.parse(validService())
    expect(service.name).toBe('Cambio de batería')
    expect(service.categoryName).toBe('Reparación')
    expect(service.costPrice).toBe(150.5)
    expect(service.salePrice).toBe(350)
  })

  it('rejects when the required name field is missing', () => {
    const { name, ...rest } = validService()
    void name
    const result = serviceSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects when the required categoryName field is missing', () => {
    const { categoryName, ...rest } = validService()
    void categoryName
    const result = serviceSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects a type mismatch on costPrice', () => {
    const result = serviceSchema.safeParse({ ...validService(), costPrice: 'not-a-number' })
    expect(result.success).toBe(false)
  })

  it('rejects a type mismatch on salePrice', () => {
    const result = serviceSchema.safeParse({ ...validService(), salePrice: 'x' })
    expect(result.success).toBe(false)
  })

  it('parses successfully with the active boolean omitted', () => {
    const service = serviceSchema.parse(validService())
    expect('active' in service).toBe(false)
  })

  it('accepts optional fields when present', () => {
    const service = serviceSchema.parse({
      ...validService(),
      active: true,
      brand: 'Samsung',
      model: 'A54',
      durationText: '30 min',
    })
    expect(service.active).toBe(true)
    expect(service.brand).toBe('Samsung')
    expect(service.durationText).toBe('30 min')
  })
})
