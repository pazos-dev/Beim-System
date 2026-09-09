import type { PoolClient, PoolConfig } from "pg";
import { describe, expect, it } from "vitest";

import { PgUnitOfWork, type TxClient } from "../../application/shared/unit-of-work.js";
import * as poolModule from "./pool.js";
import { createPool, resolvePoolConfig } from "./pool.js";

/**
 * Unit 1 foundation: injected pool, no import side effect.
 *
 * `pool.ts` MUST NOT construct a `Pool` (or open any connection) at import
 * time — the legacy singleton keeps living in `src/composition-root.ts`
 * (re-exported by `src/config/db.ts`) until cutover. Injection only.
 */
class FakePool {
  static instances: FakePool[] = [];
  readonly config: PoolConfig;
  constructor(config: PoolConfig) {
    this.config = config;
    FakePool.instances.push(this);
  }
}

function stubClient(statements: string[]): {
  client: PoolClient;
  isReleased: () => boolean;
} {
  let released = false;
  const client = {
    query: async (text: string) => {
      statements.push(text);
      return { rows: [] };
    },
    release: () => {
      released = true;
    }
  } as unknown as PoolClient;
  return { client, isReleased: () => released };
}

describe("createPool (injected, no import side effect)", () => {
  it("exposes no shared singleton at import time", () => {
    expect((poolModule as Record<string, unknown>).pool).toBeUndefined();
  });

  it("builds the pool through the injected constructor with resolved defaults", () => {
    // Arrange
    FakePool.instances.length = 0;
    const connectionString = "postgres://beim@127.0.0.1:5432/beim_api_test";

    // Act
    const pool = createPool(
      connectionString,
      undefined,
      FakePool as unknown as Parameters<typeof createPool>[2]
    );

    // Assert
    expect(pool).toBeInstanceOf(FakePool);
    expect(FakePool.instances).toHaveLength(1);
    expect(FakePool.instances[0]?.config).toEqual(resolvePoolConfig(connectionString));
    expect(FakePool.instances[0]?.config.connectionString).toBe(connectionString);
  });

  it("keeps the production fail-fast defaults byte-identical to the legacy pool", () => {
    // Arrange
    const connectionString = "postgres://beim@127.0.0.1:5432/beim_api_test";

    // Act
    const resolved = resolvePoolConfig(connectionString);

    // Assert
    expect(resolved).toMatchObject({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000
    });
  });

  it("lets explicit overrides win over the defaults", () => {
    // Arrange
    const connectionString = "postgres://beim@127.0.0.1:5432/beim_api_test";

    // Act
    const resolved = resolvePoolConfig(connectionString, { max: 2 });

    // Assert
    expect(resolved.max).toBe(2);
    expect(resolved.connectionString).toBe(connectionString);
  });
});

describe("single connection (spec scenario: two adapters share one run)", () => {
  it("passes the same TxClient to both adapters and commits exactly once", async () => {
    // Arrange
    const statements: string[] = [];
    const stub = stubClient(statements);
    const uow = new PgUnitOfWork({ connect: async () => stub.client });
    const seen: TxClient[] = [];
    const adapterA = async (tx: TxClient): Promise<void> => {
      seen.push(tx);
    };
    const adapterB = async (tx: TxClient): Promise<number> => {
      seen.push(tx);
      return 7;
    };

    // Act
    const result = await uow.run(async (tx) => {
      await adapterA(tx);
      return adapterB(tx);
    });

    // Assert
    expect(result).toBe(7);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(stub.client);
    expect(seen[1]).toBe(stub.client);
    expect(statements).toEqual(["BEGIN", "COMMIT"]);
    expect(stub.isReleased()).toBe(true);
  });
});
