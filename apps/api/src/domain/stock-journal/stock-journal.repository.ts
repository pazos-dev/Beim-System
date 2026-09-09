/**
 * StockJournal repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the append-only journal root. Zero implementations
 * in `domain/`.
 */
import type { StockJournalEntry } from "./stock-journal.js";

export interface StockJournalRepository {
  append(entry: StockJournalEntry): Promise<void>;
  listByProduct(productId: string): Promise<readonly StockJournalEntry[]>;
}
