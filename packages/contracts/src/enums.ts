import { z } from 'zod'

/** Legacy `users.role` CHECK constraint. */
export const UserRole = z.enum(['cliente', 'admin', 'superadmin'] as const)
export type UserRole = z.infer<typeof UserRole>

/** Legacy `products.currency` / `orders.currency` CHECK constraints. */
export const Currency = z.enum(['UYU', 'USD', 'USDT'] as const)
export type Currency = z.infer<typeof Currency>

/** Legacy `orders.status` values. */
export const OrderStatus = z.enum(['Pendiente', 'Pagado', 'Enviado', 'Entregado', 'Cancelado'] as const)
export type OrderStatus = z.infer<typeof OrderStatus>

/** Legacy `orders.payment_status` values. */
export const PaymentStatus = z.enum(['Pendiente de pago', 'Pagado', 'Parcial', 'Rechazado'] as const)
export type PaymentStatus = z.infer<typeof PaymentStatus>

/**
 * Legacy `gestion_stock_movements.movement_type` values.
 * Source: pagina-web/server.js insertGestionStockMovement calls + sistema-gestion/app.js labels map.
 * DB column is `text not null` (no CHECK constraint); enum covers all values produced by legacy code.
 */
export const StockMovementType = z.enum([
  'sale', 'purchase', 'return', 'adjustment',
  'sale_annulment', 'purchase_annulment',
  'web_transfer_out', 'web_transfer_in',
  'initial_stock',
  'service_order_sale', 'service_order_return',
] as const)
export type StockMovementType = z.infer<typeof StockMovementType>
