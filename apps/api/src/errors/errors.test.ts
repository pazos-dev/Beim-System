import { describe, expect, it } from "vitest";
import { AppError } from "./AppError.js";
import { buildErrorEnvelope, buildSuccessEnvelope, errorFromUnknown } from "./envelope.js";
import {
  AuthError,
  ConflictError,
  ERROR_CODES,
  InsufficientStockError,
  NotFoundError,
  ValidationError
} from "./taxonomy.js";

/** Documented HTTP mapping (source of truth: design.md AD-8 + tasks.md 2.1). */
const EXPECTED_HTTP_BY_CODE: Record<string, number> = {
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
};

describe("ERROR_CODES", () => {
  it("maps every error code to the documented HTTP status", () => {
    for (const [code, expectedStatus] of Object.entries(EXPECTED_HTTP_BY_CODE)) {
      expect(ERROR_CODES[code as keyof typeof ERROR_CODES]).toBe(expectedStatus);
    }
  });

  it("covers exactly the documented codes (no extra, no missing)", () => {
    expect(Object.keys(ERROR_CODES).sort()).toEqual(Object.keys(EXPECTED_HTTP_BY_CODE).sort());
  });
});

describe("error taxonomy classes", () => {
  it("ValidationError maps to 422 with the Spanish default message", () => {
    const error = new ValidationError();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.status).toBe(422);
    expect(error.message).toBe("Datos de entrada inválidos");
  });

  it("ValidationError exposes field-level details in the error envelope", () => {
    const details = [{ path: "name", message: "String must contain at least 2 character(s)" }];
    const error = new ValidationError(undefined, details);
    const envelope = buildErrorEnvelope(error);
    expect(envelope).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Datos de entrada inválidos", details }
    });
  });

  it("NotFoundError maps to 404 and hides details when none are provided", () => {
    const error = new NotFoundError();
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(buildErrorEnvelope(error)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "Recurso no encontrado" }
    });
  });

  it("ConflictError maps to 409", () => {
    const error = new ConflictError();
    expect(error.status).toBe(409);
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toBe("Conflicto con el estado actual del recurso");
  });

  it("InsufficientStockError maps to 409 and reports current stock", () => {
    const error = new InsufficientStockError(undefined, { currentStock: 3 });
    expect(error.status).toBe(409);
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(buildErrorEnvelope(error).error.details).toEqual({ currentStock: 3 });
  });

  it("AuthError with AUTHENTICATION_REQUIRED maps to 401", () => {
    const error = new AuthError("AUTHENTICATION_REQUIRED");
    expect(error.status).toBe(401);
    expect(error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(error.message).toBe("Autenticación requerida");
  });

  it("AuthError with FORBIDDEN maps to 403 and accepts a custom message", () => {
    const error = new AuthError("FORBIDDEN", "El rol no permite esta operación");
    expect(error.status).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("El rol no permite esta operación");
  });

  it("AppError can be constructed directly for codes without a dedicated class", () => {
    const error = new AppError("UNSUPPORTED_MEDIA_TYPE", "Tipo de medio no soportado", ERROR_CODES.UNSUPPORTED_MEDIA_TYPE);
    expect(error.status).toBe(415);
    expect(error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(error.details).toBeUndefined();
  });
});

describe("errorFromUnknown", () => {
  it("passes AppError instances through unchanged", () => {
    const original = new ConflictError();
    expect(errorFromUnknown(original)).toBe(original);
  });

  it("converts a plain Error into INTERNAL_ERROR 500 without leaking its message", () => {
    const converted = errorFromUnknown(new Error("secreto de conexión"));
    expect(converted).toBeInstanceOf(AppError);
    expect(converted.status).toBe(500);
    expect(converted.code).toBe("INTERNAL_ERROR");
    expect(converted.message).toBe("Error interno del servidor");
    expect(converted.details).toBeUndefined();
  });

  it("converts non-Error values into INTERNAL_ERROR 500", () => {
    const converted = errorFromUnknown("string thrown");
    expect(converted.code).toBe("INTERNAL_ERROR");
    expect(converted.status).toBe(500);
  });

  it("converts null into INTERNAL_ERROR 500", () => {
    const converted = errorFromUnknown(null);
    expect(converted.code).toBe("INTERNAL_ERROR");
    expect(converted.status).toBe(500);
  });
});

describe("buildSuccessEnvelope", () => {
  it("wraps data as { ok: true, data }", () => {
    expect(buildSuccessEnvelope({ status: "ok" })).toEqual({ ok: true, data: { status: "ok" } });
  });

  it("passes through primitive data unchanged", () => {
    expect(buildSuccessEnvelope(42)).toEqual({ ok: true, data: 42 });
  });
});