import { Pool, type PoolConfig } from "pg";

/**
 * Injected `pg` pool factory (infrastructure slice, Unit 1 foundation).
 *
 * This module has NO import side effect: importing it never constructs a
 * pool and never opens a connection. Callers build their pool explicitly
 * with `createPool` (production wires the connection string from
 * `loadConfig().database`; tests inject a fake constructor).
 *
 * The legacy singleton keeps living in `src/composition-root.ts`
 * (re-exported by `src/config/db.ts`) with identical behavior until
 * cutover — this factory is additive only, no behavior change.
 */

export type { TxClient } from "../../application/shared/unit-of-work.js";

/** Fail-fast defaults, byte-identical to the legacy pool in composition-root. */
const POOL_DEFAULTS = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000
} as const satisfies Partial<PoolConfig>;

/** Constructor surface `createPool` needs; keeps the factory testable DB-free. */
export type PoolConstructor<P = unknown> = new (config: PoolConfig) => P;

/** Merges caller overrides over the production fail-fast defaults. */
export function resolvePoolConfig(
  connectionString: string,
  overrides: Partial<PoolConfig> = {}
): PoolConfig {
  return { connectionString, ...POOL_DEFAULTS, ...overrides };
}

/**
 * Builds a `pg` pool without any module-level singleton. `PoolImpl` exists
 * so DB-free tests inject a fake; production always uses the real `Pool`.
 */
export function createPool<P>(
  connectionString: string,
  overrides?: Partial<PoolConfig>,
  PoolImpl: PoolConstructor<P> = Pool as unknown as PoolConstructor<P>
): P {
  return new PoolImpl(resolvePoolConfig(connectionString, overrides));
}
