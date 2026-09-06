import { AppError } from "./AppError.js";
import { ERROR_CODES, MESSAGE_BY_CODE, type ErrorCode } from "./taxonomy.js";

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ErrorEnvelopeBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ErrorEnvelope {
  ok: false;
  error: ErrorEnvelopeBody;
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function buildSuccessEnvelope<T>(data: T): SuccessEnvelope<T> {
  return { ok: true, data };
}

export function buildErrorEnvelope(error: AppError): ErrorEnvelope {
  const body: ErrorEnvelopeBody = { code: error.code, message: error.message };
  if (error.details !== undefined) {
    body.details = error.details;
  }
  return { ok: false, error: body };
}

/**
 * Normalizes any thrown value into an AppError. AppError instances pass
 * through unchanged; everything else becomes INTERNAL_ERROR without leaking
 * the original message (the error handler logs the raw cause).
 */
export function errorFromUnknown(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("INTERNAL_ERROR", MESSAGE_BY_CODE.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR);
}