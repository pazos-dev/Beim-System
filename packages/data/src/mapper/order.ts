import type { Order, OrderItem, PaymentStatus } from '@beim/contracts'
import type { Prisma } from '@prisma/client'
import { decimalToNumber, type DecimalLike } from './money'
import { toOrderItemContract } from './order-item'

type OrderRow = Prisma.OrderGetPayload<true>
type OrderItemRow = Prisma.OrderItemGetPayload<true>

/** Extract the Prisma PaymentStatus enum union from the Order row type. */
type PrismaPaymentStatus = OrderRow['paymentStatus']

/**
 * Map the Prisma `PaymentStatus` enum value to the contract value.
 * Only `Pendiente_de_pago` differs (Prisma identifiers cannot contain spaces).
 */
export function toPaymentStatus(status: PrismaPaymentStatus): PaymentStatus {
  switch (status) {
    case 'Pendiente_de_pago':
      return 'Pendiente de pago'
    case 'Pagado':
      return 'Pagado'
    case 'Parcial':
      return 'Parcial'
    case 'Rechazado':
      return 'Rechazado'
    default:
      return status
  }
}

/**
 * Map a Prisma `Order` row to the `@beim/contracts` `Order` type.
 * Converts Decimal total to number and maps the payment status enum.
 */
export function toOrderContract(row: OrderRow): Order {
  return {
    id: row.id,
    ...(row.invoiceNumber != null ? { invoiceNumber: row.invoiceNumber } : {}),
    ...(row.userId != null ? { userId: row.userId } : {}),
    customer: row.customer,
    ...(row.email != null ? { email: row.email } : {}),
    ...(row.phone != null ? { phone: row.phone } : {}),
    ...(row.ci != null ? { ci: row.ci } : {}),
    ...(row.rut != null ? { rut: row.rut } : {}),
    ...(row.paymentMethodId != null ? { paymentMethodId: row.paymentMethodId } : {}),
    ...(row.paymentMethodName != null ? { paymentMethodName: row.paymentMethodName } : {}),
    ...(row.paymentInstructions != null ? { paymentInstructions: row.paymentInstructions } : {}),
    paymentStatus: toPaymentStatus(row.paymentStatus),
    ...(row.paymentReceiptPath != null ? { paymentReceiptPath: row.paymentReceiptPath } : {}),
    ...(row.paymentReceiptName != null ? { paymentReceiptName: row.paymentReceiptName } : {}),
    ...(row.paymentReviewedAt != null ? { paymentReviewedAt: row.paymentReviewedAt } : {}),
    ...(row.stockCommitted != null ? { stockCommitted: row.stockCommitted } : {}),
    ...(row.documentType != null ? { documentType: row.documentType } : {}),
    ...(row.documentValue != null ? { documentValue: row.documentValue } : {}),
    ...(row.address != null ? { address: row.address } : {}),
    ...(row.shipping != null ? { shipping: row.shipping } : {}),
    ...(row.comments != null ? { comments: row.comments } : {}),
    total: decimalToNumber(row.total as DecimalLike),
    currency: row.currency,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Map an array of Prisma `OrderItem` rows to `OrderItem` contracts.
 */
export function toOrderItemsContract(rows: OrderItemRow[]): OrderItem[] {
  return rows.map(toOrderItemContract)
}
