import { describe, expect, it } from "vitest";

import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import { ValidationError } from "../../domain/shared/errors.js";
import type { Client, User } from "../../domain/user/user.js";
import type { Category, FixedExpense } from "../../domain/settings/settings.js";
import { makeCreatesHandlers } from "./creates.js";
import type { CreatesCatalogAdminStore, CreatesIdentityStore } from "./ports.js";

const UID_ADMIN = "a1111111-1111-4111-8111-111111111111";
const UID_CLIENT = "b2222222-2222-4222-8222-222222222222";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeIdentityStore implements CreatesIdentityStore {
  users = new Map<string, User>();
  clients = new Map<string, Client>();
  seenTx: TxClient[] = [];
  userSaves = 0;
  clientSaves = 0;

  async saveUser(tx: TxClient, user: User): Promise<void> {
    this.seenTx.push(tx);
    this.userSaves += 1;
    this.users.set(user.id, user);
  }

  async saveClient(tx: TxClient, client: Client): Promise<void> {
    this.seenTx.push(tx);
    this.clientSaves += 1;
    this.clients.set(client.id, client);
  }
}

class FakeAdminStore implements CreatesCatalogAdminStore {
  categories = new Map<string, Category>();
  expenses = new Map<string, FixedExpense>();
  seenTx: TxClient[] = [];
  categorySaves = 0;
  expenseSaves = 0;

  async saveCategory(tx: TxClient, category: Category): Promise<void> {
    this.seenTx.push(tx);
    this.categorySaves += 1;
    this.categories.set(category.id, category);
  }

  async saveFixedExpense(tx: TxClient, expense: FixedExpense): Promise<void> {
    this.seenTx.push(tx);
    this.expenseSaves += 1;
    this.expenses.set(expense.id, expense);
  }
}

function setup() {
  const uow = new FakeUnitOfWork();
  const identity = new FakeIdentityStore();
  const admin = new FakeAdminStore();
  const handlers = makeCreatesHandlers({ uow, identity, admin });
  return { uow, identity, admin, handlers };
}

describe("creates handlers (Unit 10)", () => {
  it("creates a user with one commit on the run tx", async () => {
    const { uow, identity, handlers } = setup();
    const user = await handlers.createUser({
      id: UID_ADMIN,
      username: "caja01",
      name: "Caja Uno",
      role: "caja"
    });
    expect(user.id).toBe(UID_ADMIN);
    expect(user.active).toBe(true);
    expect(user.role).toBe("caja");
    expect(uow.runs).toBe(1);
    expect(identity.userSaves).toBe(1);
    expect(identity.seenTx[0]).toBe(uow.tx);
  });

  it("rejects an invalid user with zero saves", async () => {
    const { uow, identity, handlers } = setup();
    await expect(
      handlers.createUser({ id: UID_ADMIN, username: "  ", name: "Caja Uno", role: "caja" })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      handlers.createUser({ id: UID_ADMIN, username: "caja01", name: "Caja Uno", role: "owner" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(identity.userSaves).toBe(0);
    expect(uow.runs).toBe(2);
  });

  it("creates a client unapproved with one commit on the run tx", async () => {
    const { uow, identity, handlers } = setup();
    const client = await handlers.createClient({
      id: UID_CLIENT,
      name: "Juan Perez",
      email: "juan@example.com",
      phone: "099123456"
    });
    expect(client.id).toBe(UID_CLIENT);
    expect(client.isApproved).toBe(false);
    expect(client.ci).toBeNull();
    expect(client.rut).toBeNull();
    expect(uow.runs).toBe(1);
    expect(identity.clientSaves).toBe(1);
    expect(identity.seenTx[0]).toBe(uow.tx);
  });

  it("rejects an invalid client with zero saves", async () => {
    const { identity, handlers } = setup();
    await expect(handlers.createClient({ id: UID_CLIENT, name: "  " })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(identity.clientSaves).toBe(0);
  });

  it("creates a category with null defaults and one commit", async () => {
    const { uow, admin, handlers } = setup();
    const category = await handlers.createCategory({
      id: "cat-repuestos",
      name: "Repuestos",
      code: "REP"
    });
    expect(category.description).toBeNull();
    expect(category.parentId).toBeNull();
    expect(uow.runs).toBe(1);
    expect(admin.categorySaves).toBe(1);
    expect(admin.seenTx[0]).toBe(uow.tx);
  });

  it("rejects an invalid category with zero saves", async () => {
    const { admin, handlers } = setup();
    await expect(
      handlers.createCategory({ id: "cat-x", name: "X", code: "  " })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(admin.categorySaves).toBe(0);
  });

  it("creates a fixed expense with null defaults and one commit", async () => {
    const { uow, admin, handlers } = setup();
    const expense = await handlers.createFixedExpense({
      id: "exp-alquiler",
      expenseMonth: "2026-09",
      categoryName: "Alquiler",
      amount: 15000
    });
    expect(expense.userId).toBeNull();
    expect(expense.notes).toBeNull();
    expect(uow.runs).toBe(1);
    expect(admin.expenseSaves).toBe(1);
    expect(admin.seenTx[0]).toBe(uow.tx);
  });

  it("rejects an invalid fixed expense with zero saves", async () => {
    const { admin, handlers } = setup();
    await expect(
      handlers.createFixedExpense({
        id: "exp-x",
        expenseMonth: "09-2026",
        categoryName: "Alquiler",
        amount: 10
      })
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      handlers.createFixedExpense({
        id: "exp-x",
        expenseMonth: "2026-09",
        categoryName: "Alquiler",
        amount: -5
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(admin.expenseSaves).toBe(0);
  });

  it("lets domain validation pass through unmapped (code + status)", async () => {
    const { handlers } = setup();
    const err = await handlers
      .createCategory({ id: "cat-x", name: "X", code: "" })
      .then(
        () => null,
        (e: unknown) => e as ValidationError
      );
    expect(err).toBeInstanceOf(ValidationError);
    expect(err?.code).toBe("VALIDATION_ERROR");
    expect(err?.status).toBe(422);
  });
});
