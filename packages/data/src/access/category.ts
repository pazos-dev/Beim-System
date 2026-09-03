import type { Category } from '@beim/contracts'
import { prisma } from './prisma'
import { toCategoryContract } from '../mapper/category'

/**
 * List all categories.
 */
export async function listCategories(): Promise<Category[]> {
  const rows = await prisma.category.findMany()
  return rows.map(toCategoryContract)
}

/**
 * Get a single category by ID.
 */
export async function getCategoryById(id: string): Promise<Category | null> {
  const row = await prisma.category.findUnique({ where: { id } })
  return row ? toCategoryContract(row) : null
}

/**
 * Upsert a category by ID (create if not found, update if found).
 */
export async function upsertCategory(data: {
  id: string
  name: string
  code: string
  description: string
  parentId?: string | null
  sortOrder?: number
}): Promise<Category> {
  const existing = await prisma.category.findUnique({ where: { id: data.id } })
  if (existing) {
    const updateData: Record<string, unknown> = {
      name: data.name,
      code: data.code,
      description: data.description,
    }
    if (data.parentId !== undefined) updateData['parentId'] = data.parentId
    if (data.sortOrder !== undefined) updateData['sortOrder'] = data.sortOrder
    const updated = await prisma.category.update({
      where: { id: data.id },
      data: updateData as Parameters<typeof prisma.category.update>[0]['data'],
    })
    return toCategoryContract(updated)
  }

  const createData: Record<string, unknown> = {
    id: data.id,
    name: data.name,
    code: data.code,
    description: data.description,
  }
  if (data.parentId !== undefined) createData['parentId'] = data.parentId
  if (data.sortOrder !== undefined) createData['sortOrder'] = data.sortOrder

  const created = await prisma.category.create({
    data: createData as Parameters<typeof prisma.category.create>[0]['data'],
  })
  return toCategoryContract(created)
}
