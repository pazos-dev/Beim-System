import { z } from "zod";

import { STATE_TOKENS, type StateToken } from "../../state-tokens.js";
import type { GestionError } from "../../../server/data/schemas.js";
import { stateTokenSchema } from "../../../server/data/schemas.js";
import { createGestionError, ERROR_CODES } from "../../../server/handlers/errors.js";
import { err, ok, type Result } from "../../../server/handlers/result.js";

export const ORDER_STATUS = {
  EN_DIAGNOSTICO: STATE_TOKENS.EN_DIAGNOSTICO,
  PRESUPUESTADO: STATE_TOKENS.PRESUPUESTADO,
  ESPERANDO_APROBACION: STATE_TOKENS.ESPERANDO_APROBACION,
  APROBADO: STATE_TOKENS.APROBADO,
  ESPERANDO_REPUESTO: STATE_TOKENS.ESPERANDO_REPUESTO,
  EN_REPARACION: STATE_TOKENS.EN_REPARACION,
  CONTROL_CALIDAD: STATE_TOKENS.CONTROL_CALIDAD,
  LISTO_PARA_RETIRAR: STATE_TOKENS.LISTO_PARA_RETIRAR,
  FINALIZADO: STATE_TOKENS.FINALIZADO,
  ENTREGADO: STATE_TOKENS.ENTREGADO,
  CANCELADO: STATE_TOKENS.CANCELADO
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

const ORDER_STATUS_VALUES: ReadonlyArray<string> = Object.values(ORDER_STATUS);

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && ORDER_STATUS_VALUES.includes(value);
}

const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, ReadonlyArray<OrderStatus>>> = {
  [ORDER_STATUS.EN_DIAGNOSTICO]: [ORDER_STATUS.PRESUPUESTADO, ORDER_STATUS.CANCELADO],
  [ORDER_STATUS.PRESUPUESTADO]: [ORDER_STATUS.ESPERANDO_APROBACION, ORDER_STATUS.CANCELADO],
  [ORDER_STATUS.ESPERANDO_APROBACION]: [
    ORDER_STATUS.APROBADO,
    ORDER_STATUS.PRESUPUESTADO,
    ORDER_STATUS.CANCELADO
  ],
  [ORDER_STATUS.APROBADO]: [
    ORDER_STATUS.ESPERANDO_REPUESTO,
    ORDER_STATUS.EN_REPARACION,
    ORDER_STATUS.CANCELADO
  ],
  [ORDER_STATUS.ESPERANDO_REPUESTO]: [ORDER_STATUS.EN_REPARACION, ORDER_STATUS.CANCELADO],
  [ORDER_STATUS.EN_REPARACION]: [
    ORDER_STATUS.ESPERANDO_REPUESTO,
    ORDER_STATUS.CONTROL_CALIDAD,
    ORDER_STATUS.CANCELADO
  ],
  [ORDER_STATUS.CONTROL_CALIDAD]: [
    ORDER_STATUS.EN_REPARACION,
    ORDER_STATUS.LISTO_PARA_RETIRAR,
    ORDER_STATUS.CANCELADO
  ],
  [ORDER_STATUS.LISTO_PARA_RETIRAR]: [ORDER_STATUS.FINALIZADO, ORDER_STATUS.CANCELADO],
  [ORDER_STATUS.FINALIZADO]: [ORDER_STATUS.ENTREGADO, ORDER_STATUS.CANCELADO],
  [ORDER_STATUS.ENTREGADO]: [],
  [ORDER_STATUS.CANCELADO]: []
};

export function canTransitionOrder(from: unknown, to: unknown): boolean {
  if (!isOrderStatus(from) || !isOrderStatus(to)) return false;
  return ORDER_TRANSITIONS[from].includes(to);
}

export function transitionOrder(from: OrderStatus, to: OrderStatus): Result<OrderStatus, GestionError> {
  if (!canTransitionOrder(from, to)) {
    return err(createGestionError(ERROR_CODES.CONFLICT, { from, to }));
  }
  return ok(to);
}

export const ORDER_PAYMENT_METHOD_VALUES = ["efectivo", "tarjeta", "transferencia", "mixto"] as const;

export const ORDER_PAYMENT_STATUS_VALUES = ["pendiente", "parcial", "pagado"] as const;

export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUS_VALUES)[number];

const orderSaleItemSchema = z.object({
  productoId: z.string().min(1).max(100),
  cantidad: z.number().int().positive(),
  precio: z.number().min(0)
});

const orderSalePaymentSchema = z.object({
  metodo: z.enum(ORDER_PAYMENT_METHOD_VALUES),
  monto: z.number().min(0)
});

const orderSaleInputSchema = z.object({
  numero: z.string().min(1).max(40).optional(),
  items: z.array(orderSaleItemSchema).min(1),
  pagos: z.array(orderSalePaymentSchema).min(1)
});

export const createOrderInputSchema = z.object({
  clienteId: z.string().min(1).max(100),
  numero: z.string().min(1).max(40).optional(),
  total: z.number().min(0).optional(),
  sale: orderSaleInputSchema.optional()
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

export type OrderSaleInput = z.infer<typeof orderSaleInputSchema>;

export const updateOrderInputSchema = z
  .object({
    estado: stateTokenSchema.optional(),
    paymentStatus: z.enum(ORDER_PAYMENT_STATUS_VALUES).optional()
  })
  .refine((input) => input.estado !== undefined || input.paymentStatus !== undefined, {
    error: "At least one of estado or paymentStatus is required."
  });

export type UpdateOrderInput = z.infer<typeof updateOrderInputSchema>;

export function derivePaymentStatus(total: number, paid: number): OrderPaymentStatus {
  if (paid >= total) return "pagado";
  if (paid > 0) return "parcial";
  return "pendiente";
}

export interface SaleTotals {
  paid: number;
  total: number;
}

export function saleTotals(sale: OrderSaleInput): SaleTotals {
  const total = sale.items.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
  const paid = sale.pagos.reduce((sum, pago) => sum + pago.monto, 0);
  return { paid, total };
}

const NUMERO_SUFFIX_PATTERN = /(\d+)\s*$/;

export function nextOrderNumero(existing: ReadonlyArray<string>): string {
  let max = 0;
  for (const numero of existing) {
    const match = NUMERO_SUFFIX_PATTERN.exec(numero);
    if (match?.[1] !== undefined) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isSafeInteger(parsed) && parsed > max) max = parsed;
    }
  }
  return `0001-${String(max + 1).padStart(6, "0")}`;
}

export type { StateToken };
