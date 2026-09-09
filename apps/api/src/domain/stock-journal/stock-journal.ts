/**
 * StockJournal (domain slice, change `clean-arch-domain` Phase 6.3).
 *
 * Append-only movement journal over `audit_logs` (action `stock.movement`).
 * Mutations belong to `Product` (decrement/restore); this module only
 * records and lists entries, never mutates stock. Framework-free. No DDL/SQL.
 */
import { ValidationError } from "../shared/errors.js";
import { createProductId } from "../shared/types.js";

export interface StockJournalEntry {
  readonly productId: string;
  readonly movementType: string;
  readonly quantity: number;
  readonly detail: string | null;
  readonly actorUserId: string | null;
  readonly createdAt: Date;
}

export interface RecordStockMovementInput {
  readonly productId: string;
  readonly movementType: string;
  readonly quantity: number;
  readonly detail?: string;
  readonly actorUserId?: string;
  readonly createdAt?: Date;
}

/** Appends one journal entry; validates only, never touches stock. */
export function recordStockMovement(input: RecordStockMovementInput): StockJournalEntry {
  const productId = createProductId(input.productId);
  if (input.movementType.trim() === "") {
    throw new ValidationError("Movimiento inválido: movementType no puede estar vacío", {});
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new ValidationError("Movimiento inválido: quantity debe ser un entero positivo", {
      quantity: input.quantity
    });
  }
  return {
    productId,
    movementType: input.movementType,
    quantity: input.quantity,
    detail: input.detail ?? null,
    actorUserId: input.actorUserId ?? null,
    createdAt: input.createdAt ?? new Date()
  };
}

/** Lists entries ordered by creation; pure copy, input untouched. */
export function listJournalEntries(entries: readonly StockJournalEntry[]): readonly StockJournalEntry[] {
  return [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
