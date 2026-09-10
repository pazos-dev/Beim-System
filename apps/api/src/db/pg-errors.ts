/**
 * Shared Postgres error predicates.
 *
 * Centralizes driver-error classification so repositories share one
 * definition instead of duplicating local helpers.
 */

/** True when the driver error is a Postgres unique violation (SQLSTATE 23505). */
export function isPgUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null | undefined)?.code === "23505";
}

/** True when the target table does not exist (SQLSTATE 42P01, e.g. pre-DDL or post-down). */
export function isPgUndefinedTable(err: unknown): boolean {
  return (err as { code?: string } | null | undefined)?.code === "42P01";
}
