import type { User } from '@beim/contracts'
import { prisma } from './prisma'
import { toUserContract } from '../mapper/user'

/**
 * List all users.
 */
export async function listUsers(): Promise<User[]> {
  const rows = await prisma.user.findMany()
  return rows.map(toUserContract)
}

/**
 * Get a single user by ID.
 */
export async function getUserById(id: string): Promise<User | null> {
  const row = await prisma.user.findUnique({ where: { id } })
  return row ? toUserContract(row) : null
}

/**
 * Upsert a user by email or username (create if not found, update if found).
 */
export async function upsertUser(data: {
  id?: string
  name: string
  firstName?: string
  lastName?: string
  username?: string
  email?: string
  passwordHash: string
  role: 'cliente' | 'admin' | 'superadmin'
  phone?: string
  company?: string
  ci?: string
  rut?: string
  department?: string
  locality?: string
  address?: string
  website?: string
  tradeReferences?: string
  isWholesaler?: boolean
  isBeim?: boolean
  isApproved?: boolean
}): Promise<User> {
  // Try to find existing by email or username
  const existing = data.email
    ? await prisma.user.findUnique({ where: { email: data.email } })
    : data.username
      ? await prisma.user.findUnique({ where: { username: data.username } })
      : null

  if (existing) {
    const updateData: Record<string, unknown> = { name: data.name, passwordHash: data.passwordHash, role: data.role }
    if (data.firstName !== undefined) updateData['firstName'] = data.firstName
    if (data.lastName !== undefined) updateData['lastName'] = data.lastName
    if (data.phone !== undefined) updateData['phone'] = data.phone
    if (data.company !== undefined) updateData['company'] = data.company
    if (data.ci !== undefined) updateData['ci'] = data.ci
    if (data.rut !== undefined) updateData['rut'] = data.rut
    if (data.department !== undefined) updateData['department'] = data.department
    if (data.locality !== undefined) updateData['locality'] = data.locality
    if (data.address !== undefined) updateData['address'] = data.address
    if (data.website !== undefined) updateData['website'] = data.website
    if (data.tradeReferences !== undefined) updateData['tradeReferences'] = data.tradeReferences
    if (data.isWholesaler !== undefined) updateData['isWholesaler'] = data.isWholesaler
    if (data.isBeim !== undefined) updateData['isBeim'] = data.isBeim
    if (data.isApproved !== undefined) updateData['isApproved'] = data.isApproved
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: updateData,
    })
    return toUserContract(updated)
  }

  const createData: Record<string, unknown> = {
    name: data.name,
    passwordHash: data.passwordHash,
    role: data.role,
  }
  if (data.id !== undefined) createData['id'] = data.id
  if (data.firstName !== undefined) createData['firstName'] = data.firstName
  if (data.lastName !== undefined) createData['lastName'] = data.lastName
  if (data.username !== undefined) createData['username'] = data.username
  if (data.email !== undefined) createData['email'] = data.email
  if (data.phone !== undefined) createData['phone'] = data.phone
  if (data.company !== undefined) createData['company'] = data.company
  if (data.ci !== undefined) createData['ci'] = data.ci
  if (data.rut !== undefined) createData['rut'] = data.rut
  if (data.department !== undefined) createData['department'] = data.department
  if (data.locality !== undefined) createData['locality'] = data.locality
  if (data.address !== undefined) createData['address'] = data.address
  if (data.website !== undefined) createData['website'] = data.website
  if (data.tradeReferences !== undefined) createData['tradeReferences'] = data.tradeReferences
  if (data.isWholesaler !== undefined) createData['isWholesaler'] = data.isWholesaler
  if (data.isBeim !== undefined) createData['isBeim'] = data.isBeim
  if (data.isApproved !== undefined) createData['isApproved'] = data.isApproved

  const created = await prisma.user.create({
    data: createData as Parameters<typeof prisma.user.create>[0]['data'],
  })
  return toUserContract(created)
}
