import { AppError } from "./AppError.js";

/**
 * Single source of truth mapping error codes to HTTP statuses. The central
 * error middleware translates any thrown AppError into this status + the
 * `{ ok: false, error }` envelope.
 */
export const ERROR_CODES = {
  VALIDATION_ERROR: 422,
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND_OR_FORBIDDEN: 404,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

/** User-facing messages, in neutral Spanish (API surface language). */
export const MESSAGE_BY_CODE = {
  VALIDATION_ERROR: "Datos de entrada inválidos",
  AUTHENTICATION_REQUIRED: "Autenticación requerida",
  FORBIDDEN: "No tiene permisos para realizar esta operación",
  NOT_FOUND_OR_FORBIDDEN: "Recurso no encontrado",
  CONFLICT: "Conflicto con el estado actual del recurso",
  INSUFFICIENT_STOCK: "Stock insuficiente",
  UNSUPPORTED_MEDIA_TYPE: "Tipo de medio no soportado",
  PAYLOAD_TOO_LARGE: "Archivo demasiado grande",
  DEPENDENCY_UNAVAILABLE: "Dependencia no disponible",
  INTERNAL_ERROR: "Error interno del servidor"
} as const;

export type AuthCode = Extract<ErrorCode, "AUTHENTICATION_REQUIRED" | "FORBIDDEN">;

export class ValidationError extends AppError {
  constructor(message: string = MESSAGE_BY_CODE.VALIDATION_ERROR, details?: unknown) {
    super("VALIDATION_ERROR", message, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = MESSAGE_BY_CODE.NOT_FOUND_OR_FORBIDDEN, details?: unknown) {
    super("NOT_FOUND_OR_FORBIDDEN", message, ERROR_CODES.NOT_FOUND_OR_FORBIDDEN, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = MESSAGE_BY_CODE.CONFLICT, details?: unknown) {
    super("CONFLICT", message, ERROR_CODES.CONFLICT, details);
  }
}

export class InsufficientStockError extends AppError {
  constructor(message: string = MESSAGE_BY_CODE.INSUFFICIENT_STOCK, details?: { currentStock: number }) {
    super("INSUFFICIENT_STOCK", message, ERROR_CODES.INSUFFICIENT_STOCK, details);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string = MESSAGE_BY_CODE.UNSUPPORTED_MEDIA_TYPE, details?: unknown) {
    super("UNSUPPORTED_MEDIA_TYPE", message, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, details);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string = MESSAGE_BY_CODE.PAYLOAD_TOO_LARGE, details?: unknown) {
    super("PAYLOAD_TOO_LARGE", message, ERROR_CODES.PAYLOAD_TOO_LARGE, details);
  }
}

export class AuthError extends AppError {
  constructor(code: AuthCode, message?: string, details?: unknown) {
    super(code, message ?? MESSAGE_BY_CODE[code], ERROR_CODES[code], details);
  }
}