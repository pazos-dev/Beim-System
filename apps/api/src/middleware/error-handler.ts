import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { buildErrorEnvelope, errorFromUnknown } from "../errors/envelope.js";

/**
 * Central error middleware: translates any thrown error into the
 * `{ ok: false, error }` envelope with the HTTP status from the taxonomy.
 * Must be mounted LAST in the middleware chain (4-arg signature is what
 * Express uses to recognize it as error middleware).
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const appError = errorFromUnknown(err);
  if (!(err instanceof AppError)) {
    console.error("[error-handler] Unhandled error:", err);
  }
  res.status(appError.status).json(buildErrorEnvelope(appError));
};

/**
 * Wraps an async route handler so rejections are forwarded to the central
 * error middleware instead of crashing the process.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}