/**
 * Receipts service (PR 3): receipt CRUD + annul.
 *
 * Annul (spec: "Annul restores stock") runs in ONE transaction:
 *   - 404 when the receipt does not exist, 409 when already Cancelado;
 *   - restores stock for every part that consumed it (stock_decremented=true);
 *   - flips the receipt to Cancelado / Sin abonar / price 0;
 *   - journals NEGATIVE reversal movements (payment_status 'Anulado', same
 *     business_date as the originals) so the payment journal sums to zero.
 */
import { withTransaction } from "../../../db/withTransaction.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../../errors/taxonomy.js";
import type {
  AuditLogActor,
  BeimReceipt,
  JsonValue,
  ReceiptInsertInput,
  ReceiptsListFilter
} from "../ports.js";
import { auditLogsRepository } from "../repositories/pg-audit-logs.js";
import { paymentMovementsRepository } from "../repositories/pg-payment-movements.js";
import { receiptsRepository } from "../repositories/pg-receipts.js";
import { stockRepository } from "../repositories/pg-stock.js";

export interface AnnulResult {
  receipt: BeimReceipt;
  restoredItems: Array<{ productId: string; quantity: number }>;
  reversedMovements: number;
}

/**
 * Repair-status state machine (issue #161). Allowed transitions per state;
 * terminal states (Entregado, Cancelado) accept none. `Cancelado` is never a
 * transition destination — annulment owns that path (POST /:id/annul).
 */
export const REPAIR_STATUS_TRANSITIONS: Record<string, string[]> = {
  Ingresado: ["En reparación"],
  "En reparación": ["Listo", "Ingresado"],
  Listo: ["Entregado", "En reparación"],
  Entregado: [],
  Cancelado: []
};

/** Closed set of valid repair states (zod enum source in schemas.ts mirrors it). */
export const REPAIR_STATUSES = [
  "Ingresado",
  "En reparación",
  "Listo",
  "Entregado",
  "Cancelado"
] as const;

export type RepairStatus = (typeof REPAIR_STATUSES)[number];

function isRepairStatus(value: string): value is RepairStatus {
  return (REPAIR_STATUSES as readonly string[]).includes(value);
}

export const receiptsService = {
  /** Receipt creation (walk-in / repair intake). payload defaults to {}. */
  async create(
    input: Omit<ReceiptInsertInput, "payload"> & { payload?: JsonValue }
  ): Promise<BeimReceipt> {
    // Server-side authority: every intake starts as Ingresado, whatever the
    // client sent (sales-batch bypasses this service and sets Entregado
    // directly at the repository — that path is untouched).
    return receiptsRepository.insertReceipt({ ...input, repairStatus: "Ingresado", payload: input.payload ?? {} });
  },

  async list(filter: ReceiptsListFilter = {}) {
    return receiptsRepository.list(filter);
  },

  async getById(id: string): Promise<BeimReceipt | null> {
    return receiptsRepository.getById(id);
  },

  async nextNumber(): Promise<number> {
    return receiptsRepository.nextNumber();
  },

  /**
   * Repair-status transition (issue #161). Guards in order:
   * 404 unknown id → 422 `Cancelado` destination (use annul) → 422 unknown
   * destination → legacy passthrough → idempotent same-state → 422
   * unlisted transition → persist + best-effort `receipt.status` journal.
   */
  async transitionRepairStatus(
    receiptId: string,
    toStatus: string,
    actor: AuditLogActor = {}
  ): Promise<BeimReceipt> {
    const receipt = await receiptsRepository.getById(receiptId);
    if (receipt === null) {
      throw new NotFoundError(`Recibo no encontrado: ${receiptId}`);
    }
    if (toStatus === "Cancelado") {
      throw new ValidationError("El estado Cancelado requiere anular el recibo", {
        from: receipt.repairStatus,
        to: toStatus,
        hint: "use POST /receipts/:id/annul"
      });
    }
    if (!isRepairStatus(toStatus)) {
      throw new ValidationError(`Estado de reparación inválido: ${toStatus}`, {
        from: receipt.repairStatus,
        to: toStatus,
        allowed: [...REPAIR_STATUSES]
      });
    }
    const from = receipt.repairStatus;
    const allowed = REPAIR_STATUS_TRANSITIONS[from];
    if (allowed === undefined) {
      // Unknown/legacy current state: single entry door into the machine —
      // any valid state is accepted from here exactly once.
      const updated = await receiptsRepository.setRepairStatus(receiptId, toStatus);
      await journalStatusChange(receiptId, actor, from, toStatus).catch(() => undefined);
      return updated;
    }
    if (from === toStatus) return receipt;
    if (!allowed.includes(toStatus)) {
      throw new ValidationError(`Transición de estado inválida: ${from} → ${toStatus}`, {
        from,
        to: toStatus,
        allowed
      });
    }
    const updated = await receiptsRepository.setRepairStatus(receiptId, toStatus);
    // Audit journal: best-effort, never masks the transition outcome.
    await journalStatusChange(receiptId, actor, from, toStatus).catch(() => undefined);
    return updated;
  },

  async annul(receiptId: string, actor: AuditLogActor = {}): Promise<AnnulResult> {
    return withTransaction(async (tx) => {
      const receipt = await receiptsRepository.getById(receiptId, tx);
      if (receipt === null) {
        throw new NotFoundError(`Recibo no encontrado: ${receiptId}`);
      }
      if (receipt.repairStatus === "Cancelado") {
        throw new ConflictError("El recibo ya fue anulado");
      }

      const parts = await receiptsRepository.getConsumedParts(tx, receiptId);
      const restoredItems: Array<{ productId: string; quantity: number }> = [];
      for (const part of parts) {
        if (part.productId === null) continue;
        await stockRepository.restore(part.productId, part.quantity, tx);
        restoredItems.push({ productId: part.productId, quantity: part.quantity });
      }

      await receiptsRepository.markAnnuled(tx, receiptId);

      // Financial correction: reverse every positive movement once (never
      // reverse reversals). Same business_date keeps the journal truthful.
      const originals = await paymentMovementsRepository.listForReceipt(tx, receiptId);
      let reversedMovements = 0;
      for (const movement of originals) {
        if (movement.amount <= 0) continue;
        await paymentMovementsRepository.insert(tx, {
          receiptId,
          amount: -movement.amount,
          paymentStatus: "Anulado",
          method: movement.method,
          businessDate: movement.businessDate
        });
        reversedMovements += 1;
      }

      // Audit journal (issue #97): who annulled what, inside the same transaction.
      await auditLogsRepository.insert(
        {
          actorUserId: actor.actorUserId ?? null,
          actorRole: actor.actorRole ?? null,
          action: "receipt.annul",
          entityType: "receipt",
          entityId: receiptId,
          details: { receiptId, restoredItems: restoredItems.length, reversedMovements }
        },
        tx
      );

      const updated = await receiptsRepository.getById(receiptId, tx);
      return { receipt: updated as BeimReceipt, restoredItems, reversedMovements };
    });
  }
};

async function journalStatusChange(
  receiptId: string,
  actor: AuditLogActor,
  from: string,
  to: string
): Promise<void> {
  await auditLogsRepository.insert({
    actorUserId: actor.actorUserId ?? null,
    actorRole: actor.actorRole ?? null,
    action: "receipt.status",
    entityType: "receipt",
    entityId: receiptId,
    details: { receiptId, from, to }
  });
}