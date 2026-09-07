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
