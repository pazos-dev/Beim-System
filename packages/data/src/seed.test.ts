import { describe, expect, it, vi, beforeEach } from 'vitest'

const userUpserts: unknown[] = []
const settingsUpserts: unknown[] = []
const categoryUpserts: unknown[] = []
const productUpserts: unknown[] = []
const slideUpserts: unknown[] = []

const mockDisconnect = vi.fn().mockResolvedValue(undefined)

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    user: { upsert: vi.fn().mockImplementation((...args: unknown[]) => { userUpserts.push(args[0]); return Promise.resolve({}) }) },
    appSetting: { upsert: vi.fn().mockImplementation((...args: unknown[]) => { settingsUpserts.push(args[0]); return Promise.resolve({}) }) },
    category: { upsert: vi.fn().mockImplementation((...args: unknown[]) => { categoryUpserts.push(args[0]); return Promise.resolve({}) }) },
    product: { upsert: vi.fn().mockImplementation((...args: unknown[]) => { productUpserts.push(args[0]); return Promise.resolve({}) }) },
    promoSlide: { upsert: vi.fn().mockImplementation((...args: unknown[]) => { slideUpserts.push(args[0]); return Promise.resolve({}) }) },
    $disconnect: mockDisconnect,
  })),
}))

describe('seed', () => {
  beforeEach(() => {
    userUpserts.length = 0
    settingsUpserts.length = 0
    categoryUpserts.length = 0
    productUpserts.length = 0
    slideUpserts.length = 0
    vi.clearAllMocks()
  })

  it('creates 3 users, 1 settings, 7 categories, 6 products, 3 slides', async () => {
    const { main } = await import('./seed')
    await main()

    expect(userUpserts).toHaveLength(3)
    expect(settingsUpserts).toHaveLength(1)
    expect(categoryUpserts).toHaveLength(7)
    expect(productUpserts).toHaveLength(6)
    expect(slideUpserts).toHaveLength(3)

    // Verify user roles
    const roles = userUpserts.map((u) => (u as Record<string, unknown>)['create']).map((c) => (c as Record<string, unknown>)['role'])
    expect(roles).toContain('admin')
    expect(roles).toContain('superadmin')
    expect(roles).toContain('cliente')

    // Verify settings key
    expect((settingsUpserts[0] as Record<string, unknown>)['where']).toEqual({ key: 'store' })

    // Verify category IDs
    const categoryIds = categoryUpserts.map((c) => (c as Record<string, unknown>)['where']).map((w) => (w as Record<string, unknown>)['id'])
    expect(categoryIds).toContain('celulares')
    expect(categoryIds).toContain('notebooks')
    expect(categoryIds).toContain('servicio')

    // Verify product IDs
    const productIds = productUpserts.map((p) => (p as Record<string, unknown>)['where']).map((w) => (w as Record<string, unknown>)['id'])
    expect(productIds).toContain('smartphone-premium')
    expect(productIds).toContain('combo-gaming')

    // Verify slide IDs
    const slideIds = slideUpserts.map((s) => (s as Record<string, unknown>)['where']).map((w) => (w as Record<string, unknown>)['id'])
    expect(slideIds).toEqual(['slide-1', 'slide-2', 'slide-3'])
  })

  it('is idempotent — second call succeeds with same counts', async () => {
    const { main } = await import('./seed')
    await main()
    const firstCounts = {
      users: userUpserts.length,
      settings: settingsUpserts.length,
      categories: categoryUpserts.length,
      products: productUpserts.length,
      slides: slideUpserts.length,
    }

    vi.clearAllMocks()
    userUpserts.length = 0
    settingsUpserts.length = 0
    categoryUpserts.length = 0
    productUpserts.length = 0
    slideUpserts.length = 0

    const { main: main2 } = await import('./seed')
    await main2()

    expect(userUpserts).toHaveLength(firstCounts.users)
    expect(settingsUpserts).toHaveLength(firstCounts.settings)
    expect(categoryUpserts).toHaveLength(firstCounts.categories)
    expect(productUpserts).toHaveLength(firstCounts.products)
    expect(slideUpserts).toHaveLength(firstCounts.slides)
  })
})
