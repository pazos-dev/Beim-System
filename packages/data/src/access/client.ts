import type { Client } from '@beim/contracts'
import { prisma } from './prisma'
import { toClientContract } from '../mapper/client'

/**
 * List all active clients.
 */
export async function listClients(): Promise<Client[]> {
  const rows = await prisma.gestionClient.findMany({
    where: { active: true },
  })
  return rows.map(toClientContract)
}

/**
 * Get a client by ID.
 */
export async function getClientById(id: string): Promise<Client | null> {
  const row = await prisma.gestionClient.findUnique({ where: { id } })
  return row ? toClientContract(row) : null
}

/**
 * Upsert a client — find by document or name, update if found, create if not.
 * Only matches active clients to avoid resurrecting soft-deleted records.
 */
export async function upsertClient(data: {
  id?: string
  name: string
  document?: string
  phone?: string
  email?: string
}): Promise<Client> {
  // Try to find existing by document (if provided)
  if (data.document) {
    const byDocument = await prisma.gestionClient.findFirst({
      where: { document: data.document, active: true },
    })
    if (byDocument) {
      const updateData: Record<string, unknown> = { name: data.name, document: data.document }
      if (data.phone !== undefined) updateData['phone'] = data.phone
      if (data.email !== undefined) updateData['email'] = data.email
      const updated = await prisma.gestionClient.update({
        where: { id: byDocument.id },
        data: updateData as Parameters<typeof prisma.gestionClient.update>[0]['data'],
      })
      return toClientContract(updated)
    }
  }

  // Try to find existing by name
  const byName = await prisma.gestionClient.findFirst({
    where: { name: data.name, active: true },
  })
  if (byName) {
    const updateData: Record<string, unknown> = { name: data.name }
    if (data.document !== undefined) updateData['document'] = data.document
    if (data.phone !== undefined) updateData['phone'] = data.phone
    if (data.email !== undefined) updateData['email'] = data.email
    const updated = await prisma.gestionClient.update({
      where: { id: byName.id },
      data: updateData as Parameters<typeof prisma.gestionClient.update>[0]['data'],
    })
    return toClientContract(updated)
  }

  // Create new client
  const createData: Record<string, unknown> = { name: data.name }
  if (data.id !== undefined) createData['id'] = data.id
  if (data.document !== undefined) createData['document'] = data.document
  if (data.phone !== undefined) createData['phone'] = data.phone
  if (data.email !== undefined) createData['email'] = data.email

  const created = await prisma.gestionClient.create({
    data: createData as Parameters<typeof prisma.gestionClient.create>[0]['data'],
  })
  return toClientContract(created)
}

/**
 * Soft-delete a client by setting active to false.
 */
export async function softDeleteClient(id: string): Promise<Client> {
  const updated = await prisma.gestionClient.update({
    where: { id },
    data: { active: false },
  })
  return toClientContract(updated)
}
