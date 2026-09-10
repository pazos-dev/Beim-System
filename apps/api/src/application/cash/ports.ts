import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { CashSession } from "../../domain/cash-session/cash-session.js";

/**
 * Tx-bound cash access; adapters own SQL, movements travel via the
 * `CashSession` root only. `findOpen` backs the at-most-one-open invariant,
 * `findByBusinessDate` backs `BusinessDate` uniqueness.
 */
export interface CashStore {
  findById(tx: TxClient, id: string): Promise<CashSession | null>;
  findOpen(tx: TxClient): Promise<CashSession | null>;
  findByBusinessDate(tx: TxClient, businessDate: string): Promise<CashSession | null>;
  save(tx: TxClient, session: CashSession): Promise<void>;
}

export interface CashDeps {
  uow: UnitOfWork;
  cash: CashStore;
}
