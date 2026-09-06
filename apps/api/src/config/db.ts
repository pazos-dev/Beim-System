import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { loadConfig } from "./env.js";

const { connectionString } = loadConfig().database;

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Fail fast instead of queueing forever: checkout on pool exhaustion gives
  // up after 5s, and no statement runs longer than 10s.
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Runs `fn` inside a single transaction (BEGIN/COMMIT/ROLLBACK) and always
 * releases the client back to the pool. The work function receives the
 * transaction-bound client so repositories can share the same connection.
 */
// withTransaction moved to src/db/withTransaction.ts (task 3.3); re-exported
// from here so both import locations keep working.
export { withTransaction } from "../db/withTransaction.js";
export type { TxClient } from "../db/withTransaction.js";