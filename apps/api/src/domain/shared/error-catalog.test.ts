import { describe, expect, it } from "vitest";

import { AppError } from "../../errors/AppError.js";
import {
  AuthError,
  ConflictError,
  DependencyUnavailableError,
  ERROR_CODES,
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from "../../errors/taxonomy.js";
import { toAppError } from "../../infrastructure/persistence/error-map.js";

import {
  CATALOG_VIOLATION,
  catalogEntryFor,
  domainErrorFor,
  ERROR_CATALOG,
} from "./error-catalog.js";

describe("domain error catalog (frozen taxonomy mapping)", () => {
  it("holds exactly the seven spec rows, no invented codes", () => {
    const keys = Object.keys(ERROR_CATALOG);
    expect(keys).toHaveLength(7);
    for (const entry of Object.values(ERROR_CATALOG)) {
      expect(entry.code in ERROR_CODES).toBe(true);
      expect(entry.status).toBe(ERROR_CODES[entry.code]);
    }
  });

  it("maps insufficient stock to INSUFFICIENT_STOCK 409 via toAppError", () => {
    const mapped = toAppError(new InsufficientStockError());
    expect(mapped.code).toBe("INSUFFICIENT_STOCK");
    expect(mapped.status).toBe(409);
    expect(mapped.status).toBe(ERROR_CODES.INSUFFICIENT_STOCK);
  });

  it("maps double open/close to CONFLICT 409 via toAppError", () => {
    const mapped = toAppError(new ConflictError());
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
  });

  it("maps unknown references to NOT_FOUND_OR_FORBIDDEN 404 via toAppError", () => {
    const mapped = toAppError(new NotFoundError());
    expect(mapped.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(mapped.status).toBe(404);
  });

  it("maps invalid input to VALIDATION_ERROR 422 via toAppError", () => {
    const mapped = toAppError(new ValidationError());
    expect(mapped.code).toBe("VALIDATION_ERROR");
    expect(mapped.status).toBe(422);
  });

  it("maps illegal transitions to VALIDATION_ERROR 422 via toAppError (GAP: no dedicated code)", () => {
    const mapped = toAppError(new ValidationError("Illegal repair-status transition"));
    expect(mapped.code).toBe("VALIDATION_ERROR");
    expect(mapped.status).toBe(422);
    expect(catalogEntryFor(CATALOG_VIOLATION.ILLEGAL_TRANSITION).code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("maps invalid webhook signatures to FORBIDDEN 403 via toAppError", () => {
    const mapped = toAppError(new AuthError("FORBIDDEN"));
    expect(mapped.code).toBe("FORBIDDEN");
    expect(mapped.status).toBe(403);
  });

  it("maps missing secrets to DEPENDENCY_UNAVAILABLE 503 via toAppError", () => {
    const mapped = toAppError(new DependencyUnavailableError());
    expect(mapped.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(mapped.status).toBe(503);
  });

  it("builds frozen AppErrors per catalog row via domainErrorFor", () => {
    for (const violation of Object.values(CATALOG_VIOLATION)) {
      const entry = catalogEntryFor(violation);
      const err = domainErrorFor(violation);
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(entry.code);
      expect(err.status).toBe(entry.status);
      expect(toAppError(err)).toBe(err);
    }
  });
});
