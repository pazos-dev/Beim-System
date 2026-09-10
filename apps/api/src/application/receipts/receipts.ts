/**
 * Receipt handlers (change `clean-arch-application`, Unit 4).
 *
 * One thin function per use case: plain DTO → `UnitOfWork.run` → load
 * `Receipt` for-update → one domain behavior (`createReceipt`,
 * `transitionRepairStatus`, `annulReceipt`) → save on the same `TxClient`
 * → commit. Intake always forces `Ingresado` (domain ignores the input
 * status); `Cancelado` flows only via `annul()`, which restores consumed
 * `taller` lots and journals negative reversals atomically — every domain
 * guard runs before the first save, so an unknown lane leaves zero partial
 * writes. Domain errors pass through untouched to the edge `toAppError`
 * mapping.
 */
import { NotFoundError } from "../../domain/shared/errors.js";
import type { StockLot } from "../../domain/product/stock-lot.js";
import {
  annulReceipt,
  createReceipt,
  transitionRepairStatus,
  type AnnulResult,
  type CreateReceiptInput,
  type Receipt
} from "../../domain/receipt/receipt.js";
import type { ReceiptDeps } from "./ports.js";

export interface TransitionRepairStatusInput {
  readonly receiptId: string;
  readonly to: string;
}

export interface AnnulReceiptInput {
  readonly receiptId: string;
  readonly businessDate: string;
}

function receiptNotFound(id: string): NotFoundError {
  return new NotFoundError(`Recibo no encontrado: ${id}`);
}

export function makeReceiptHandlers(deps: ReceiptDeps) {
  const { uow, receipts } = deps;

  return {
    async intake(input: CreateReceiptInput): Promise<Receipt> {
      return uow.run(async (tx) => {
        const receipt = createReceipt(input);
        await receipts.save(tx, receipt);
        return receipt;
      });
    },

    async transitionStatus(input: TransitionRepairStatusInput): Promise<Receipt> {
      return uow.run(async (tx) => {
        const found = await receipts.findById(tx, input.receiptId);
        if (found === null) throw receiptNotFound(input.receiptId);
        const next = transitionRepairStatus(found, input.to);
        await receipts.save(tx, next);
        return next;
      });
    },

    async annul(input: AnnulReceiptInput): Promise<AnnulResult> {
      return uow.run(async (tx) => {
        const found = await receipts.findById(tx, input.receiptId);
        if (found === null) throw receiptNotFound(input.receiptId);
        if (found.repairStatus === "Cancelado") {
          return { receipt: found, lots: new Map(), reversals: [] };
        }
        const lanes = new Map<string, readonly StockLot[]>();
        for (const part of found.parts) {
          if (!part.stockDecremented || part.productId === null || part.allocations.length === 0) {
            continue;
          }
          if (!lanes.has(part.productId)) {
            const lane = await receipts.findTallerLots(tx, part.productId);
            if (lane !== null) lanes.set(part.productId, lane);
          }
        }
        // Pure validation (business date, unknown lanes) throws here,
        // before the first save: zero partial writes on failure.
        const result = annulReceipt(found, lanes, input.businessDate);
        for (const [productId, lots] of result.lots) {
          if (lanes.has(productId)) {
            await receipts.saveTallerLots(tx, productId, lots);
          }
        }
        await receipts.save(tx, result.receipt);
        if (result.reversals.length > 0) {
          await receipts.saveReversals(tx, result.reversals);
        }
        return result;
      });
    }
  };
}
