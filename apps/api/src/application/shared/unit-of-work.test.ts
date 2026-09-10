import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { PgUnitOfWork, type TxClient, type UnitOfWork } from "./unit-of-work.js";

/** DB-free stand-in: runs the callback against a dummy client, no I/O. */
class FakeUnitOfWork implements UnitOfWork {
  constructor(private readonly tx: TxClient = {} as TxClient) {}

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    return fn(this.tx);
  }
}

interface StubClient {
  client: PoolClient;
  statements: string[];
  isReleased: () => boolean;
}

function createStubClient(failOn?: string): StubClient {
  const statements: string[] = [];
  let released = false;
  const client = {
    query: async (text: string) => {
      statements.push(text);
      if (text === failOn) throw new Error(`${text} failed`);
      return { rows: [] };
    },
    release: () => {
      released = true;
    }
  } as unknown as PoolClient;
  return { client, statements, isReleased: () => released };
}

describe("FakeUnitOfWork", () => {
  it("returns the callback result with the same transaction client", async () => {
    // Arrange
    const tx = {} as TxClient;
    const uow = new FakeUnitOfWork(tx);
    let seen: TxClient | undefined;

    // Act
    const result = await uow.run(async (t) => {
      seen = t;
      return 42;
    });

    // Assert
    expect(result).toBe(42);
    expect(seen).toBe(tx);
  });

  it("propagates callback errors", async () => {
    // Arrange
    const uow = new FakeUnitOfWork();
    const failure = new Error("use-case failed");

    // Act
    const promise = uow.run(async () => {
      throw failure;
    });

    // Assert
    await expect(promise).rejects.toBe(failure);
  });
});

describe("PgUnitOfWork", () => {
  it("begins, commits, and releases on success, returning the result", async () => {
    // Arrange
    const stub = createStubClient();
    const uow = new PgUnitOfWork({ connect: async () => stub.client });
    let seen: TxClient | undefined;

    // Act
    const result = await uow.run(async (tx) => {
      seen = tx;
      return "ok";
    });

    // Assert
    expect(result).toBe("ok");
    expect(seen).toBe(stub.client);
    expect(stub.statements).toEqual(["BEGIN", "COMMIT"]);
    expect(stub.isReleased()).toBe(true);
  });

  it("rolls back, releases, and rethrows the original error on failure", async () => {
    // Arrange
    const stub = createStubClient();
    const uow = new PgUnitOfWork({ connect: async () => stub.client });
    const failure = new Error("aggregate save failed");

    // Act
    const promise = uow.run(async () => {
      throw failure;
    });

    // Assert
    await expect(promise).rejects.toBe(failure);
    expect(stub.statements).toEqual(["BEGIN", "ROLLBACK"]);
    expect(stub.isReleased()).toBe(true);
  });

  it("releases without committing when BEGIN itself fails", async () => {
    // Arrange
    const stub = createStubClient("BEGIN");
    const uow = new PgUnitOfWork({ connect: async () => stub.client });

    // Act
    const promise = uow.run(async () => "never runs");

    // Assert
    await expect(promise).rejects.toThrow("BEGIN failed");
    expect(stub.statements).toEqual(["BEGIN"]);
    expect(stub.isReleased()).toBe(true);
  });
});
