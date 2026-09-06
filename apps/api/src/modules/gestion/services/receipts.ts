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
import { ConflictError, NotFoundError } from "../../../errors/taxonomy.js";
import type { BeimReceipt, JsonValue, ReceiptInsertInput, ReceiptsListFilter } from "../ports.js";
import { paymentMovementsRepository } from "../repositories/pg-payment-movements.js";
import { receiptsRepository } from "../repositories/pg-receipts.js";
import { stockRepository } from "../repositories/pg-stock.js";

export interface AnnulResult {
  receipt: BeimReceipt;
  restoredItems: Array<{ productId: string; quantity: number }>;
  reversedMovements: number;
}

export const receiptsService = {
  /** Receipt creation (walk-in / repair intake). payload defaults to {}. */
  async create(
    input: Omit<ReceiptInsertInput, "payload"> & { payload?: JsonValue }
  ): Promise<BeimReceipt> {
    return receiptsRepository.insertReceipt({ ...input, payload: input.payload ?? {} });
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

  async annul(receiptId: string): Promise<AnnulResult> {
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

      const updated = await receiptsRepository.getById(receiptId, tx);
      return { receipt: updated as BeimReceipt, restoredItems, reversedMovements };
    });
  }
};