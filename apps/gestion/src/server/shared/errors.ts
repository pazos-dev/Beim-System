import {
  ERROR_CODE_VALUES,
  type ErrorEnvelope,
  type GestionError,
  type GestionErrorDetails,
  type SchemaErrorCode
} from "../data/schemas";

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

const HTTP_STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND_OR_FORBIDDEN: 404,
  CONFLICT: 409,
  DEPENDENCY_UNAVAILABLE: 503,
  STORAGE_ERROR: 500,
  AUDIT_FAILURE: 500
};

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

export function getHttpStatus(code: ErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}

export function createGestionError(
  code: ErrorCode,
  details?: GestionErrorDetails,
  message: string = MESSAGE_BY_CODE[code]
): GestionError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function buildErrorEnvelope(
  code: ErrorCode,
  details?: GestionErrorDetails,
  message?: string
): ErrorEnvelope {
  return { ok: false, error: createGestionError(code, details, message) };
}

export function normalizeErrorCode(code: SchemaErrorCode): ErrorCode {
  return code;
}

export function errorFromUnknown(error: unknown, code: ErrorCode = ERROR_CODES.STORAGE_ERROR): GestionError {
  if (error instanceof Error && error.message.length > 0) {
    return createGestionError(code);
  }
  return createGestionError(code);
}
