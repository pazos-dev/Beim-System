import { z } from "zod";
import type { GestionError, MovimientoStock } from "../../../server/data/schemas";
import { createGestionError, ERROR_CODES } from "../../../server/handlers/errors";
import { err, ok, type Result } from "../../../server/handlers/result";
export const DEPOSITS = { PRINCIPAL: "principal", TALLER: "taller" } as const;
const depositoSchema = z.string().trim().min(1).max(40);
export const purchaseInputSchema = z.object({
  productoId: z.string().min(1).max(100),
  cantidad: z.number().int().positive(),
  costoUnitario: z.number().min(0),
  proveedor: z.string().trim().min(1).max(120),
  deposito: depositoSchema.optional()
});
export const transferInputSchema = z.object({
  productoId: z.string().min(1).max(100),
  cantidad: z.number().int().positive(),
  origen: depositoSchema,
  destino: depositoSchema
}).refine((input) => input.origen !== input.destino, { error: "Origen and destino must differ." });
const OUTFLOW_MOTIVES = { VENTA: "venta", CONSUMO: "consumo" } as const;
export const outflowInputSchema = z.object({
  productoId: z.string().min(1).max(100),
  cantidad: z.number().int().positive(),
  motivo: z.enum(OUTFLOW_MOTIVES),
  deposito: depositoSchema.optional(),
  ajuste: z.boolean().default(false)
});
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export type TransferInput = z.infer<typeof transferInputSchema>;
export type OutflowInput = z.infer<typeof outflowInputSchema>;
export interface MovementDraft {
  deposito: string;
  cantidad: number;
  motivo: MovimientoStock["motivo"];
  referencia?: string;
  balanceAfter: number;
}
export function weightedAverageCost(stock: number, cost: number, cantidad: number, precio: number): number {
  return Math.round(((stock * cost + cantidad * precio) / (stock + cantidad)) * 100) / 100;
}
export function balanceKey(productoId: string, deposito: string | undefined): string {
  return `${productoId}::${deposito ?? DEPOSITS.PRINCIPAL}`;
}
type BalanceSource = Pick<MovimientoStock, "productoId" | "cantidad"> & { deposito?: string };
export function deriveBalances(movements: ReadonlyArray<BalanceSource>): Map<string, number> {
  const balances = new Map<string, number>();
  for (const movement of movements) {
    const key = balanceKey(movement.productoId, movement.deposito);
    balances.set(key, (balances.get(key) ?? 0) + movement.cantidad);
  }
  return balances;
}
function insufficient(): GestionError {
  return createGestionError(ERROR_CODES.CONFLICT, { fields: ["cantidad"] });
}
export function planOutflow(balance: number, input: OutflowInput, allowNegative: boolean): Result<MovementDraft, GestionError> {
  if (!allowNegative && balance - input.cantidad < 0) return err(insufficient());
  return ok({
    deposito: input.deposito ?? DEPOSITS.PRINCIPAL,
    cantidad: -input.cantidad,
    motivo: input.motivo,
    balanceAfter: balance - input.cantidad
  });
}
export function planTransferPair(
  balances: ReadonlyMap<string, number>,
  input: TransferInput
): Result<{ leaving: MovementDraft; arriving: MovementDraft }, GestionError> {
  const fromBalance = balances.get(balanceKey(input.productoId, input.origen)) ?? 0;
  const toBalance = balances.get(balanceKey(input.productoId, input.destino)) ?? 0;
  if (fromBalance - input.cantidad < 0) return err(insufficient());
  return ok({
    leaving: { deposito: input.origen, cantidad: -input.cantidad, motivo: "transferencia", balanceAfter: fromBalance - input.cantidad },
    arriving: { deposito: input.destino, cantidad: input.cantidad, motivo: "transferencia", balanceAfter: toBalance + input.cantidad }
  });
}
