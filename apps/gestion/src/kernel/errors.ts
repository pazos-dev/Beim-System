// Self-contained kernel errors: pinned mirror of ERROR_CODE_VALUES from
// src/server/data/schemas.ts (read-only). No zod, no I/O — safe for every
// client. Slice-1 re-points the server to this kernel.

export const ERROR_CODE_VALUES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND_OR_FORBIDDEN",
  "CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "STORAGE_ERROR",
  "AUDIT_FAILURE"
] as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: ERROR_CODE_VALUES[0],
  AUTHENTICATION_REQUIRED: ERROR_CODE_VALUES[1],
  FORBIDDEN: ERROR_CODE_VALUES[2],
  NOT_FOUND_OR_FORBIDDEN: ERROR_CODE_VALUES[3],
  CONFLICT: ERROR_CODE_VALUES[4],
  DEPENDENCY_UNAVAILABLE: ERROR_CODE_VALUES[5],
  STORAGE_ERROR: ERROR_CODE_VALUES[6],
  AUDIT_FAILURE: ERROR_CODE_VALUES[7]
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface GestionErrorDetails {
  [key: string]: unknown;
}

export interface GestionError {
  code: ErrorCode;
  message: string;
  details?: GestionErrorDetails;
}

const MESSAGE_BY_CODE: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_ERROR: "Payload inválido.",
  AUTHENTICATION_REQUIRED: "Autenticación requerida.",
  FORBIDDEN: "Acceso denegado.",
  NOT_FOUND_OR_FORBIDDEN: "Recurso no disponible.",
  CONFLICT: "La operación entra en conflicto con el estado vigente.",
  DEPENDENCY_UNAVAILABLE: "Dependencia no disponible.",
  STORAGE_ERROR: "No se pudo acceder al almacenamiento.",
  AUDIT_FAILURE: "No se pudo registrar la auditoría obligatoria."
};

export function createGestionError(
  code: ErrorCode,
  details?: GestionErrorDetails,
  message: string = MESSAGE_BY_CODE[code]
): GestionError {
  return details === undefined ? { code, message } : { code, message, details };
}
