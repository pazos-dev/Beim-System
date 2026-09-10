import type { ErrorRequestHandler } from "express";
import { buildErrorEnvelope, errorFromUnknown, type ErrorEnvelope, type SuccessEnvelope } from "../../errors/envelope.js";

/**
 * Shared error renderer (interface layer, Unidad 1 shared skin).
 *
 * Pure mapping from the frozen taxonomy (`src/errors/taxonomy.ts`) to the
 * frozen HTTP matrix: status from the taxonomy plus the `{ ok: false, error }`
 * envelope. Unknown values become 500 INTERNAL_ERROR without leaking the
 * cause (see `errorFromUnknown`). No behavior change versus the central
 * `src/middleware/error-handler.ts` middleware.
 */
export function renderError(err: unknown): { status: number; body: ErrorEnvelope } {
  const appError = errorFromUnknown(err);
  return { status: appError.status, body: buildErrorEnvelope(appError) };
}

/**
 * Frozen 201 anti-enumeration success: duplicate register answers 201 with
 * `{ user: null }` so callers can never probe which emails/usernames exist.
 */
export function renderAntiEnumerationCreated(): {
  status: 201;
  body: SuccessEnvelope<{ user: null }>;
} {
  return { status: 201, body: { ok: true, data: { user: null } } };
}

/** Express adapter for the pure renderer. Mounted LAST in router chains. */
export const interfaceErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const { status, body } = renderError(err);
  res.status(status).json(body);
};
