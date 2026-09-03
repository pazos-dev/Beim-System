import type { Service, ServiceCategory } from '@beim/contracts'
import { prisma } from './prisma'
import { toServiceContract } from '../mapper/service'
import { toServiceCategoryContract } from '../mapper/service-category'

/**
 * List all services.
 */
export async function listServices(): Promise<Service[]> {
  const rows = await prisma.gestionService.findMany()
  return rows.map(toServiceContract)
}

/**
 * Upsert a service by ID (create if not found, update if found).
 */
export async function upsertService(data: {
  id: string
  categoryName?: string
  name?: string
  costPrice?: number
  salePrice?: number
  durationText?: string
  warrantyText?: string
  notes?: string
  productKey?: string
  productName?: string
  brand?: string
  model?: string
  active?: boolean
}): Promise<Service> {
  const existing = await prisma.gestionService.findUnique({ where: { id: data.id } })
  if (existing) {
    const updated = await prisma.gestionService.update({
      where: { id: data.id },
      data,
    })
    return toServiceContract(updated)
  }

  const created = await prisma.gestionService.create({ data })
  return toServiceContract(created)
}

/**
 * Delete a service by ID.
 */
export async function deleteService(id: string): Promise<void> {
  await prisma.gestionService.delete({ where: { id } })
}

/**
 * List all service categories.
 */
export async function listServiceCategories(): Promise<ServiceCategory[]> {
  const rows = await prisma.gestionServiceCategory.findMany()
  return rows.map(toServiceCategoryContract)
}

/**
 * Upsert a service category by ID (create if not found, update if found).
 */
export async function upsertServiceCategory(data: {
  id: string
  name: string
}): Promise<ServiceCategory> {
  const existing = await prisma.gestionServiceCategory.findUnique({ where: { id: data.id } })
  if (existing) {
    const updated = await prisma.gestionServiceCategory.update({
      where: { id: data.id },
      data: { name: data.name },
    })
    return toServiceCategoryContract(updated)
  }

  const created = await prisma.gestionServiceCategory.create({ data })
  return toServiceCategoryContract(created)
}

/**
 * Delete a service category by ID.
 */
export async function deleteServiceCategory(id: string): Promise<void> {
  await prisma.gestionServiceCategory.delete({ where: { id } })
}
