import type { Order } from '@beim/contracts'
import { prisma } from './prisma'
import { toOrderContract } from '../mapper/order'

/**
 * List orders, optionally filtered by status.
 */
export async function listOrders(status?: string): Promise<Order[]> {
  const rows = status
    ? await prisma.order.findMany({ where: { status: status as 'Pendiente' | 'Pagado' | 'Enviado' | 'Entregado' | 'Cancelado' } })
    : await prisma.order.findMany()
  return rows.map(toOrderContract)
}

/**
 * Get a single order by ID.
 */
export async function getOrderById(id: string): Promise<Order | null> {
  const row = await prisma.order.findUnique({ where: { id } })
  return row ? toOrderContract(row) : null
}

/**
 * Create a new order.
 */
export async function createOrder(data: {
  id?: string
  invoiceNumber?: number
  userId?: string | null
  customer: string
  email?: string
  phone?: string
  ci?: string
  rut?: string
  paymentMethodId?: string
  paymentMethodName?: string
  paymentInstructions?: string
  paymentStatus?: 'Pendiente_de_pago' | 'Pagado' | 'Parcial' | 'Rechazado'
  paymentReceiptPath?: string
  paymentReceiptName?: string
  paymentReviewedAt?: Date
  stockCommitted?: boolean
  documentType?: string
  documentValue?: string
  address?: string
  shipping?: string
  comments?: string
  total: number
  currency?: 'UYU' | 'USD' | 'USDT'
  status?: 'Pendiente' | 'Pagado' | 'Enviado' | 'Entregado' | 'Cancelado'
}): Promise<Order> {
  const createData: Record<string, unknown> = { customer: data.customer, total: data.total }
  if (data.id !== undefined) createData['id'] = data.id
  if (data.invoiceNumber !== undefined) createData['invoiceNumber'] = data.invoiceNumber
  if (data.userId !== undefined) createData['userId'] = data.userId
  if (data.email !== undefined) createData['email'] = data.email
  if (data.phone !== undefined) createData['phone'] = data.phone
  if (data.ci !== undefined) createData['ci'] = data.ci
  if (data.rut !== undefined) createData['rut'] = data.rut
  if (data.paymentMethodId !== undefined) createData['paymentMethodId'] = data.paymentMethodId
  if (data.paymentMethodName !== undefined) createData['paymentMethodName'] = data.paymentMethodName
  if (data.paymentInstructions !== undefined) createData['paymentInstructions'] = data.paymentInstructions
  if (data.paymentStatus !== undefined) createData['paymentStatus'] = data.paymentStatus
  if (data.paymentReceiptPath !== undefined) createData['paymentReceiptPath'] = data.paymentReceiptPath
  if (data.paymentReceiptName !== undefined) createData['paymentReceiptName'] = data.paymentReceiptName
  if (data.paymentReviewedAt !== undefined) createData['paymentReviewedAt'] = data.paymentReviewedAt
  if (data.stockCommitted !== undefined) createData['stockCommitted'] = data.stockCommitted
  if (data.documentType !== undefined) createData['documentType'] = data.documentType
  if (data.documentValue !== undefined) createData['documentValue'] = data.documentValue
  if (data.address !== undefined) createData['address'] = data.address
  if (data.shipping !== undefined) createData['shipping'] = data.shipping
  if (data.comments !== undefined) createData['comments'] = data.comments
  if (data.currency !== undefined) createData['currency'] = data.currency
  if (data.status !== undefined) createData['status'] = data.status

  const created = await prisma.order.create({
    data: createData as Parameters<typeof prisma.order.create>[0]['data'],
  })
  return toOrderContract(created)
}

/**
 * Update an existing order by ID.
 */
export async function updateOrder(
  id: string,
  data: {
    invoiceNumber?: number
    userId?: string | null
    customer?: string
    email?: string | null
    phone?: string | null
    ci?: string | null
    rut?: string | null
    paymentMethodId?: string | null
    paymentMethodName?: string | null
    paymentInstructions?: string | null
    paymentStatus?: 'Pendiente_de_pago' | 'Pagado' | 'Parcial' | 'Rechazado'
    paymentReceiptPath?: string | null
    paymentReceiptName?: string | null
    paymentReviewedAt?: Date | null
    stockCommitted?: boolean
    documentType?: string | null
    documentValue?: string | null
    address?: string | null
    shipping?: string | null
    comments?: string | null
    total?: number
    currency?: 'UYU' | 'USD' | 'USDT'
    status?: 'Pendiente' | 'Pagado' | 'Enviado' | 'Entregado' | 'Cancelado'
  },
): Promise<Order> {
  // Only include fields that were explicitly set
  const updateData: Record<string, unknown> = {}
  if (data.customer !== undefined) updateData['customer'] = data.customer
  if (data.invoiceNumber !== undefined) updateData['invoiceNumber'] = data.invoiceNumber
  if (data.userId !== undefined) updateData['userId'] = data.userId
  if (data.email !== undefined) updateData['email'] = data.email
  if (data.phone !== undefined) updateData['phone'] = data.phone
  if (data.ci !== undefined) updateData['ci'] = data.ci
  if (data.rut !== undefined) updateData['rut'] = data.rut
  if (data.paymentMethodId !== undefined) updateData['paymentMethodId'] = data.paymentMethodId
  if (data.paymentMethodName !== undefined) updateData['paymentMethodName'] = data.paymentMethodName
  if (data.paymentInstructions !== undefined) updateData['paymentInstructions'] = data.paymentInstructions
  if (data.paymentStatus !== undefined) updateData['paymentStatus'] = data.paymentStatus
  if (data.paymentReceiptPath !== undefined) updateData['paymentReceiptPath'] = data.paymentReceiptPath
  if (data.paymentReceiptName !== undefined) updateData['paymentReceiptName'] = data.paymentReceiptName
  if (data.paymentReviewedAt !== undefined) updateData['paymentReviewedAt'] = data.paymentReviewedAt
  if (data.stockCommitted !== undefined) updateData['stockCommitted'] = data.stockCommitted
  if (data.documentType !== undefined) updateData['documentType'] = data.documentType
  if (data.documentValue !== undefined) updateData['documentValue'] = data.documentValue
  if (data.address !== undefined) updateData['address'] = data.address
  if (data.shipping !== undefined) updateData['shipping'] = data.shipping
  if (data.comments !== undefined) updateData['comments'] = data.comments
  if (data.total !== undefined) updateData['total'] = data.total
  if (data.currency !== undefined) updateData['currency'] = data.currency
  if (data.status !== undefined) updateData['status'] = data.status

  const updated = await prisma.order.update({
    where: { id },
    data: updateData as Parameters<typeof prisma.order.update>[0]['data'],
  })
  return toOrderContract(updated)
}
