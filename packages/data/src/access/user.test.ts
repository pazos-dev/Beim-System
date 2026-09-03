import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import { listUsers, getUserById, upsertUser } from './user'

const mockUser = {
  id: 'user-1',
  name: 'Ana García',
  firstName: 'Ana',
  lastName: 'García',
  username: 'ana',
  email: 'ana@example.com',
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
  role: 'cliente' as const,
  phone: '59899123456',
  company: 'Beim',
  ci: '12345678',
  rut: null,
  department: null,
  locality: null,
  address: 'Calle 1',
  website: null,
  tradeReferences: null,
  isWholesaler: false,
  isBeim: false,
  isApproved: true,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
} satisfies Prisma.UserGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listUsers', () => {
  it('returns all users as contract types', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([mockUser])
    const result = await listUsers()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Ana García')
    expect(result[0]!.passwordHash).toBe('$2b$10$abcdefghijklmnopqrstuv')
    expect(prisma.user.findMany).toHaveBeenCalledOnce()
  })

  it('returns empty array when no users exist', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    const result = await listUsers()
    expect(result).toEqual([])
  })
})

describe('getUserById', () => {
  it('returns a user by ID', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    const result = await getUserById('user-1')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('user-1')
    expect(result!.role).toBe('cliente')
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } })
  })

  it('returns null when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const result = await getUserById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('upsertUser', () => {
  it('creates a new user when none exists', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser)
    const result = await upsertUser({
      name: 'Ana García',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
      role: 'cliente',
      email: 'ana@example.com',
    })
    expect(result.name).toBe('Ana García')
    expect(prisma.user.create).toHaveBeenCalledOnce()
  })

  it('updates an existing user found by email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, name: 'Ana Updated' })
    const result = await upsertUser({
      name: 'Ana Updated',
      passwordHash: '$2b$10$newhash',
      role: 'admin',
      email: 'ana@example.com',
    })
    expect(result.name).toBe('Ana Updated')
    expect(prisma.user.update).toHaveBeenCalledOnce()
  })
})
