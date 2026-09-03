import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'

vi.mock('./prisma', () => ({
  prisma: {
    gestionClient: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import { listClients, getClientById, upsertClient } from './client'

const mockClient = {
  id: 'client-1',
  name: 'Juan Pérez',
  document: '12345678',
  phone: '59899000111',
  email: 'juan@example.com',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-02T00:00:00Z'),
} satisfies Prisma.GestionClientGetPayload<true>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listClients', () => {
  it('returns all clients', async () => {
    vi.mocked(prisma.gestionClient.findMany).mockResolvedValue([mockClient])
    const result = await listClients()
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Juan Pérez')
  })
})

describe('getClientById', () => {
  it('returns a client by ID', async () => {
    vi.mocked(prisma.gestionClient.findUnique).mockResolvedValue(mockClient)
    const result = await getClientById('client-1')
    expect(result).not.toBeNull()
    expect(result!.document).toBe('12345678')
  })

  it('returns null when not found', async () => {
    vi.mocked(prisma.gestionClient.findUnique).mockResolvedValue(null)
    const result = await getClientById('nonexistent')
    expect(result).toBeNull()
  })
})

describe('upsertClient', () => {
  it('creates a new client when none match', async () => {
    vi.mocked(prisma.gestionClient.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.gestionClient.create).mockResolvedValue(mockClient)
    const result = await upsertClient({
      name: 'Juan Pérez',
      document: '12345678',
    })
    expect(result.name).toBe('Juan Pérez')
    expect(prisma.gestionClient.create).toHaveBeenCalledOnce()
  })

  it('updates an existing client found by document', async () => {
    vi.mocked(prisma.gestionClient.findFirst).mockResolvedValue(mockClient)
    vi.mocked(prisma.gestionClient.update).mockResolvedValue({ ...mockClient, name: 'Updated' })
    const result = await upsertClient({
      name: 'Updated',
      document: '12345678',
    })
    expect(result.name).toBe('Updated')
    expect(prisma.gestionClient.update).toHaveBeenCalledOnce()
  })

  it('updates an existing client found by name when no document', async () => {
    vi.mocked(prisma.gestionClient.findFirst).mockResolvedValue(mockClient)
    vi.mocked(prisma.gestionClient.update).mockResolvedValue(mockClient)
    const result = await upsertClient({ name: 'Juan Pérez' })
    expect(result.name).toBe('Juan Pérez')
    expect(prisma.gestionClient.update).toHaveBeenCalledOnce()
  })
})
