import { z } from 'zod'
import { Currency, OrderStatus, PaymentStatus } from './enums'

/** Legacy `orders` table. Money `total` is `numeric(12,2)` modeled as plain number. */
export const orderSchema = z.object({
  id: z.string(),
  invoiceNumber: z.number().int().exactOptional(),
  userId: z.string().uuid().exactOptional(),
  customer: z.string(),
  email: z.string().exactOptional(),
  phone: z.string().exactOptional(),
  ci: z.string().exactOptional(),
  rut: z.string().exactOptional(),
  paymentMethodId: z.string().exactOptional(),
  paymentMethodName: z.string().exactOptional(),
  paymentInstructions: z.string().exactOptional(),
  paymentStatus: PaymentStatus,
  paymentReceiptPath: z.string().exactOptional(),
  paymentReceiptName: z.string().exactOptional(),
  paymentReviewedAt: z.date().exactOptional(),
  stockCommitted: z.boolean().exactOptional(),
  documentType: z.string().exactOptional(),
  documentValue: z.string().exactOptional(),
  address: z.string().exactOptional(),
  shipping: z.string().exactOptional(),
  comments: z.string().exactOptional(),
  total: z.number(),
  currency: Currency,
  status: OrderStatus,
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Order = z.infer<typeof orderSchema>
