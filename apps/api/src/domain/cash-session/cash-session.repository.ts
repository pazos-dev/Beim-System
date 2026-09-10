/**
 * CashSession repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the `CashSession` root; movements travel via the root
 * only. `findOpen` backs the at-most-one-open invariant, `findByBusinessDate`
 * backs `BusinessDate` uniqueness. Zero implementations in `domain/`.
 */
import type { CashSession } from "./cash-session.js";

export interface CashSessionRepository {
  findById(id: string): Promise<CashSession | null>;
  findOpen(): Promise<CashSession | null>;
  findByBusinessDate(businessDate: string): Promise<CashSession | null>;
  save(session: CashSession): Promise<void>;
}
