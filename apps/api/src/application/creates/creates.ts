/**
 * Per-aggregate create handlers (change `clean-arch-application`, Unit 10).
 *
 * One thin function per aggregate root: plain DTO → `UnitOfWork.run` →
 * construct via domain factory → save on the same `TxClient` → commit.
 * Covers the creates with domain factories + tx-bound save ports (`User`,
 * `Client`, `Category`, `FixedExpense`). `Product`/`Service` creates live
 * in `catalog/` (Unit 2), initial `CashSession` open in `cash/` (Unit 5),
 * receipt intake in `receipts/` (Unit 4) — not duplicated here. Domain
 * errors pass through untouched to the edge `toAppError` mapping.
 */
import { createClient, createUser, type Client, type CreateClientInput, type CreateUserInput, type User } from "../../domain/user/user.js";
import { createCategory, createFixedExpense, type Category, type FixedExpense } from "../../domain/settings/settings.js";
import type { CreatesDeps } from "./ports.js";

export interface CreateCategoryInput {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description?: string;
  readonly parentId?: string;
}

export interface CreateFixedExpenseInput {
  readonly id: string;
  readonly userId?: string;
  readonly expenseMonth: string;
  readonly categoryName: string;
  readonly amount: number;
  readonly notes?: string;
}

export function makeCreatesHandlers(deps: CreatesDeps) {
  const { uow, identity, admin } = deps;

  return {
    async createUser(input: CreateUserInput): Promise<User> {
      return uow.run(async (tx) => {
        const user = createUser(input);
        await identity.saveUser(tx, user);
        return user;
      });
    },

    async createClient(input: CreateClientInput): Promise<Client> {
      return uow.run(async (tx) => {
        const client = createClient(input);
        await identity.saveClient(tx, client);
        return client;
      });
    },

    async createCategory(input: CreateCategoryInput): Promise<Category> {
      return uow.run(async (tx) => {
        const category = createCategory(input);
        await admin.saveCategory(tx, category);
        return category;
      });
    },

    async createFixedExpense(input: CreateFixedExpenseInput): Promise<FixedExpense> {
      return uow.run(async (tx) => {
        const expense = createFixedExpense(input);
        await admin.saveFixedExpense(tx, expense);
        return expense;
      });
    }
  };
}
