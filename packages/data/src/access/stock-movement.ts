import type { StockMovement } from '@beim/contracts'
import { prisma } from './prisma'
import { toStockMovementContract } from '../mapper/stock-movement'

/**
 * List stock movements, optionally filtered by productId.
 * Returns newest-first order.
 */
export async function listStockMovements(productId?: string): Promise<StockMovement[]> {
  const rows = productId
    ? await prisma.gestionStockMovement.findMany({ where: { productId }, orderBy: { createdAt: 'desc' } })
    : await prisma.gestionStockMovement.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(toStockMovementContract)
}
