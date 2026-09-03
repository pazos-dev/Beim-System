import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@beim/data', () => ({
  upsertClient: vi.fn(),
  softDeleteClient: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { upsertClient, softDeleteClient } from '@beim/data'
import { createClient, updateClient, deleteClient } from '@/lib/actions/client'
import { revalidatePath } from 'next/cache'

const mockClient = {
  id: 'client-1',
  name: 'Ana Perez',
  document: '12345678',
  phone: '59899111111',
  email: 'ana@test.com',
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

function formDataWith(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  const defaults: Record<string, string> = {
    name: 'Ana Perez',
    document: '12345678',
    phone: '59899111111',
    email: 'ana@test.com',
  }
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(k, v)
  }
  return fd
}

describe('createClient', () => {
  it('rejects invalid payload (missing name)', async () => {
    const result = await createClient(formDataWith({ name: '' }))
    expect(result.error).toBeDefined()
    expect(upsertClient).not.toHaveBeenCalled()
  })

  it('creates valid client via upsertClient', async () => {
    vi.mocked(upsertClient).mockResolvedValue(mockClient)
    const result = await createClient(formDataWith())
    expect(result.error).toBeUndefined()
    expect(upsertClient).toHaveBeenCalledOnce()
  })
})

describe('updateClient', () => {
  it('rejects invalid payload', async () => {
    const result = await updateClient('client-1', formDataWith({ name: '' }))
    expect(result.error).toBeDefined()
    expect(upsertClient).not.toHaveBeenCalled()
  })

  it('updates existing client', async () => {
    vi.mocked(upsertClient).mockResolvedValue({ ...mockClient, name: 'Updated' })
    const result = await updateClient('client-1', formDataWith({ name: 'Updated' }))
    expect(result.error).toBeUndefined()
    expect(upsertClient).toHaveBeenCalledWith(expect.objectContaining({ id: 'client-1' }))
  })
})

describe('deleteClient', () => {
  it('soft-deletes the client', async () => {
    vi.mocked(softDeleteClient).mockResolvedValue({ ...mockClient, active: false })
    const result = await deleteClient('client-1')
    expect(result.error).toBeUndefined()
    expect(softDeleteClient).toHaveBeenCalledWith('client-1')
    expect(revalidatePath).toHaveBeenCalled()
  })
})
