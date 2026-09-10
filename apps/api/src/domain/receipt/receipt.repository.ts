/**
 * Receipt repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the `Receipt` root; `ReceiptPart`, `ReceiptPayment`,
 * and `ReceiptChecklist` children travel via the root only. Zero
 * implementations in `domain/`.
 */
import type { Receipt } from "./receipt.js";

export interface ReceiptRepository {
  findById(id: string): Promise<Receipt | null>;
  save(receipt: Receipt): Promise<void>;
}
