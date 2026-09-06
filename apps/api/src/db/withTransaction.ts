import type { PoolClient } from "pg";
import { pool } from "../config/db.js";

/**
 * Transaction-bound client alias. Repository functions that participate in a
 * larger unit of work (sales-batch, annul) accept a `TxClient` so the caller
 * decides the transaction boundary; functions without one open their own.
 */
export type TxClient = PoolClient;

/**
 * Runs `fn` inside a single transaction (BEGIN/COMMIT/ROLLBACK) and always
 * releases the client back to the pool. The work function receives the
 * transaction-bound client so repositories can share the same connection.
 *
 * Moved here from src/config/db.ts (task 3.3); db.ts re-exports it so both
 * import locations keep working.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
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