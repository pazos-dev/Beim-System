import { AppError } from "../../errors/AppError.js";
import { ConflictError, ERROR_CODES, MESSAGE_BY_CODE, NotFoundError } from "../../errors/taxonomy.js";

/**
 * Re-home of the frozen `Errores` taxonomy import path (slice 0.2, path-only).
 *
 * The canonical taxonomy still lives in `src/errors/taxonomy.ts` — codes and
 * Spanish messages are frozen and MUST NOT change here. This module re-exports
 * it so infrastructure code imports taxonomy symbols from the new path; the
 * legacy path keeps working untouched (its removal happens at cutover, NOT
 * in this slice).
 */
export * from "../../errors/taxonomy.js";

/** Postgres SQLSTATE codes mapped at the persistence edge. */
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const DEADLOCK_DETECTED = "40P01";
const LOCK_NOT_AVAILABLE = "55P03";

function driverCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function driverDetail(err: unknown): string {
  if (typeof err !== "object" || err === null) return "";
  const detail = (err as { detail?: unknown }).detail;
  return typeof detail === "string" ? detail : "";
}

/**
 * Maps any thrown value to a frozen-taxonomy AppError at the adapter edge.
 *
 * - AppError passes through unchanged.
 * - 23505 (unique) → CONFLICT 409.
 * - 23503 (FK): dependents blocking the write ("still referenced") →
 *   CONFLICT 409; missing parent ("not present") → NOT_FOUND_OR_FORBIDDEN
 *   404; unrecognized shape → CONFLICT 409 (fail-closed generic).
 * - 40P01 (deadlock) / 55P03 (lock unavailable) → CONFLICT 409.
 * - Anything else → INTERNAL_ERROR 500.
 *
 * Mapped errors always carry frozen default messages and NO details, so raw
 * driver text (constraints, key values, connection strings) never leaks into
 * responses, logs, or envelopes. Callers needing specific messages keep
 * throwing taxonomy classes directly.
 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  switch (driverCode(err)) {
    case UNIQUE_VIOLATION:
      return new ConflictError();
    case FOREIGN_KEY_VIOLATION: {
      const detail = driverDetail(err);
      if (/is still referenced from/i.test(detail)) return new ConflictError();
      if (/is not present in table/i.test(detail)) return new NotFoundError();
      return new ConflictError();
    }
    case DEADLOCK_DETECTED:
    case LOCK_NOT_AVAILABLE:
      return new ConflictError();
    default:
      return new AppError(
        "INTERNAL_ERROR",
        MESSAGE_BY_CODE.INTERNAL_ERROR,
        ERROR_CODES.INTERNAL_ERROR
      );
  }
}
