import type { PoolClient } from "pg";

/**
 * Transaction-bound client. Same driver type the repository already uses in
 * `src/db/withTransaction.ts`; re-declared here so the application layer
 * depends only on a type (erased at runtime), never on the pool singleton.
 */
export type TxClient = PoolClient;

/**
 * Transaction boundary for application use cases.
 *
 * Design rule: one aggregate per `run`. Cross-aggregate consistency goes
 * through domain events, never through a shared transaction.
 */
export interface UnitOfWork {
  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;
}

/** Minimal pool surface `PgUnitOfWork` needs; keeps the class testable. */
export interface ConnectablePool {
  connect(): Promise<PoolClient>;
}

/**
 * `UnitOfWork` backed by a `pg` pool. Opens a client, runs `fn` inside a
 * single transaction (BEGIN/COMMIT/ROLLBACK), then always releases the
 * client. Mirrors the semantics of `withTransaction` in `src/db/`; a future
 * infrastructure slice may unify both behind this port.
 */
export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: ConnectablePool) {}

  async run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
    } catch (err) {
      client.release();
      throw err;
    }

    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

