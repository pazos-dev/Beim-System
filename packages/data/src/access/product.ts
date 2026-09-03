import type { Product } from '@beim/contracts'
import { prisma } from './prisma'
import { toProductContract } from '../mapper/product'

/**
 * List products, optionally filtered by categoryId.
 */
export async function listProducts(categoryId?: string): Promise<Product[]> {
  const rows = categoryId
    ? await prisma.product.findMany({ where: { categoryId } })
    : await prisma.product.findMany()
  return rows.map(toProductContract)
}

/**
 * Get a single product by ID.
 */
export async function getProductById(id: string): Promise<Product | null> {
  const row = await prisma.product.findUnique({ where: { id } })
  return row ? toProductContract(row) : null
}

/**
 * Upsert a product by productCode (create if not found, update if found).
 * When productCode is null, always creates a new product.
 */
export async function upsertProduct(data: {
  id?: string
  productCode?: number | null
  name: string
  categoryId: string
  brand?: string
  model?: string
  price: number
  currency?: 'UYU' | 'USD' | 'USDT'
  stock?: number
  minStock?: number
  warrantyDays?: number
  badge?: string
  image?: string | null
  description?: string
  productType?: string
  compatibleModels?: string[]
  supplierName?: string
  supplierLot?: string
  color?: string
  costPrice?: number
}): Promise<Product> {
  if (data.productCode != null) {
    const existing = await prisma.product.findUnique({ where: { productCode: data.productCode } })
    if (existing) {
      const updateData: Record<string, unknown> = { name: data.name, categoryId: data.categoryId, price: data.price }
      if (data.brand !== undefined) updateData['brand'] = data.brand
      if (data.model !== undefined) updateData['model'] = data.model
      if (data.currency !== undefined) updateData['currency'] = data.currency
      if (data.stock !== undefined) updateData['stock'] = data.stock
      if (data.minStock !== undefined) updateData['minStock'] = data.minStock
      if (data.warrantyDays !== undefined) updateData['warrantyDays'] = data.warrantyDays
      if (data.badge !== undefined) updateData['badge'] = data.badge
      if (data.image !== undefined) updateData['image'] = data.image
      if (data.description !== undefined) updateData['description'] = data.description
      if (data.productType !== undefined) updateData['productType'] = data.productType
      if (data.compatibleModels !== undefined) updateData['compatibleModels'] = data.compatibleModels
      if (data.supplierName !== undefined) updateData['supplierName'] = data.supplierName
      if (data.supplierLot !== undefined) updateData['supplierLot'] = data.supplierLot
      if (data.color !== undefined) updateData['color'] = data.color
      if (data.costPrice !== undefined) updateData['costPrice'] = data.costPrice
      const updated = await prisma.product.update({
        where: { id: existing.id },
        data: updateData as Parameters<typeof prisma.product.update>[0]['data'],
      })
      return toProductContract(updated)
    }
  }

  const createData: Record<string, unknown> = { name: data.name, categoryId: data.categoryId, price: data.price }
  if (data.id !== undefined) createData['id'] = data.id
  if (data.productCode !== undefined) createData['productCode'] = data.productCode
  if (data.brand !== undefined) createData['brand'] = data.brand
  if (data.model !== undefined) createData['model'] = data.model
  if (data.currency !== undefined) createData['currency'] = data.currency
  if (data.stock !== undefined) createData['stock'] = data.stock
  if (data.minStock !== undefined) createData['minStock'] = data.minStock
  if (data.warrantyDays !== undefined) createData['warrantyDays'] = data.warrantyDays
  if (data.badge !== undefined) createData['badge'] = data.badge
  if (data.image !== undefined) createData['image'] = data.image
  if (data.description !== undefined) createData['description'] = data.description
  if (data.productType !== undefined) createData['productType'] = data.productType
  if (data.compatibleModels !== undefined) createData['compatibleModels'] = data.compatibleModels
  if (data.supplierName !== undefined) createData['supplierName'] = data.supplierName
  if (data.supplierLot !== undefined) createData['supplierLot'] = data.supplierLot
  if (data.color !== undefined) createData['color'] = data.color
  if (data.costPrice !== undefined) createData['costPrice'] = data.costPrice

  const created = await prisma.product.create({
    data: createData as Parameters<typeof prisma.product.create>[0]['data'],
  })
  return toProductContract(created)
}
