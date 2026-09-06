import type { ErrorCode } from "./taxonomy.js";

/**
 * Base class for every error that crosses the API boundary. Concrete taxonomy
 * classes (taxonomy.ts) carry the code/status/message mapping; this class can
 * also be instantiated directly for codes without a dedicated class.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}