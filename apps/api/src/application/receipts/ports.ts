import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { StockLot } from "../../domain/product/stock-lot.js";
import type { Receipt, ReceiptReversal } from "../../domain/receipt/receipt.js";

/**
 * Tx-bound receipt access; adapters own SQL, parts/payments/checklists
 * travel via the `Receipt` root only. `taller` lots and payment reversals
 * are separate rows the atomic `annul` must persist on the same `TxClient`.
 */
export interface ReceiptStore {
  findById(tx: TxClient, id: string): Promise<Receipt | null>;
  save(tx: TxClient, receipt: Receipt): Promise<void>;
  findTallerLots(tx: TxClient, productId: string): Promise<readonly StockLot[] | null>;
  saveTallerLots(tx: TxClient, productId: string, lots: readonly StockLot[]): Promise<void>;
  saveReversals(tx: TxClient, reversals: readonly ReceiptReversal[]): Promise<void>;
}

export interface ReceiptDeps {
  uow: UnitOfWork;
  receipts: ReceiptStore;
}
