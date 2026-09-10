import { describe, expect, it } from "vitest";
import { AppError } from "../../errors/AppError.js";
import * as legacyTaxonomy from "../../errors/taxonomy.js";
import {
  ConflictError,
  ERROR_CODES,
  MESSAGE_BY_CODE,
  NotFoundError,
  toAppError
} from "./error-map.js";

/**
 * Slice 0.2: persistence edge maps raw driver errors to the frozen taxonomy.
 * No driver text (constraint, detail, message) may leak into the AppError —
 * mapped errors carry frozen defaults only (zero PII).
 */
function driverError(code: string, extra: Record<string, unknown> = {}): unknown {
  return { name: "DatabaseError", code, ...extra };
}

describe("toAppError", () => {
  it("passes AppError instances through unchanged", () => {
    const original = new ConflictError("Ya existe un cliente con ese email");
    expect(toAppError(original)).toBe(original);
  });

  it("maps unique violation 23505 to CONFLICT 409 with the frozen message", () => {
    const mapped = toAppError(
      driverError("23505", {
        constraint: "users_email_key",
        detail: "Key (email)=(ana@example.com) already exists."
      })
    );
    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.CONFLICT);
    expect(mapped.details).toBeUndefined();
  });

  it("maps FK violation 23503 with dependents to CONFLICT 409", () => {
    const mapped = toAppError(
      driverError("23503", {
        constraint: "orders_customer_fkey",
        detail: 'Key (id)=(550e8400-e29b-41d4-a716-446655440000) is still referenced from table "orders".'
      })
    );
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.CONFLICT);
    expect(mapped.details).toBeUndefined();
  });

  it("maps FK violation 23503 with a missing parent to NOT_FOUND_OR_FORBIDDEN 404", () => {
    const mapped = toAppError(
      driverError("23503", {
        detail: 'Key (product_id)=(no-existe) is not present in table "products".'
      })
    );
    expect(mapped).toBeInstanceOf(NotFoundError);
    expect(mapped.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(mapped.status).toBe(404);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.NOT_FOUND_OR_FORBIDDEN);
    expect(mapped.details).toBeUndefined();
  });

  it("maps bare FK violation 23503 to CONFLICT 409 (fail-closed generic)", () => {
    const mapped = toAppError(driverError("23503"));
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.CONFLICT);
  });

  it.each(["40P01", "55P03"])("maps lock conflict %s to CONFLICT 409", (code) => {
    const mapped = toAppError(driverError(code, { message: "deadlock detected" }));
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.CONFLICT);
    expect(mapped.details).toBeUndefined();
  });

  it("maps unknown driver codes to INTERNAL_ERROR 500 without leaking the message", () => {
    const mapped = toAppError(driverError("XX999", { message: "secreto de conexión" }));
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.status).toBe(500);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.INTERNAL_ERROR);
    expect(mapped.details).toBeUndefined();
  });

  it("maps plain Errors to INTERNAL_ERROR 500 without leaking the message", () => {
    const mapped = toAppError(new Error("token postgresql://user:pass@host/db"));
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.status).toBe(500);
    expect(mapped.message).toBe("Error interno del servidor");
    expect(mapped.details).toBeUndefined();
  });

  it("maps non-Error values to INTERNAL_ERROR 500", () => {
    for (const value of ["string thrown", null, undefined, 42, {}]) {
      const mapped = toAppError(value);
      expect(mapped.code).toBe("INTERNAL_ERROR");
      expect(mapped.status).toBe(500);
    }
  });

  it("never leaks driver text (constraint, detail, email) into mapped errors", () => {
    const leak = "ana@example.com";
    const cases = [
      driverError("23505", { constraint: "users_email_key", detail: `Key (email)=(${leak}) already exists.` }),
      driverError("23503", { detail: `Key (id)=(${leak}) is still referenced from table "orders".` }),
      driverError("23503", { detail: `Key (product_id)=(${leak}) is not present in table "products".` })
    ];
    for (const err of cases) {
      const mapped = toAppError(err);
      expect(JSON.stringify(mapped)).not.toContain(leak);
      expect(JSON.stringify(mapped)).not.toContain("users_email_key");
    }
  });
});

describe("taxonomy re-home (frozen, path-only)", () => {
  it("re-exports the exact frozen ERROR_CODES", () => {
    expect(ERROR_CODES).toEqual(legacyTaxonomy.ERROR_CODES);
    expect(ERROR_CODES.CONFLICT).toBe(409);
    expect(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN).toBe(404);
  });

  it("re-exports the exact frozen Spanish messages", () => {
    expect(MESSAGE_BY_CODE).toEqual(legacyTaxonomy.MESSAGE_BY_CODE);
    expect(MESSAGE_BY_CODE.CONFLICT).toBe("Conflicto con el estado actual del recurso");
    expect(MESSAGE_BY_CODE.NOT_FOUND_OR_FORBIDDEN).toBe("Recurso no encontrado");
  });

  it("re-exports the taxonomy classes unchanged", () => {
    expect(new ConflictError().status).toBe(409);
    expect(new NotFoundError().status).toBe(404);
  });
});
