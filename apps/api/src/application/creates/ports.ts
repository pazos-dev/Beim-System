import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { Client, User } from "../../domain/user/user.js";
import type { Category, FixedExpense } from "../../domain/settings/settings.js";

/** Tx-bound identity access for creates; adapters own SQL. */
export interface CreatesIdentityStore {
  saveUser(tx: TxClient, user: User): Promise<void>;
  saveClient(tx: TxClient, client: Client): Promise<void>;
}

/** Tx-bound catalog-admin access for creates; adapters own SQL. */
export interface CreatesCatalogAdminStore {
  saveCategory(tx: TxClient, category: Category): Promise<void>;
  saveFixedExpense(tx: TxClient, expense: FixedExpense): Promise<void>;
}

export interface CreatesDeps {
  uow: UnitOfWork;
  identity: CreatesIdentityStore;
  admin: CreatesCatalogAdminStore;
}
