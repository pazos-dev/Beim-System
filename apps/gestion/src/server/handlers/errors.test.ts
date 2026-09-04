import { describe, expect, it } from "vitest";

import { ERROR_CODES, buildErrorEnvelope, getHttpStatus, type ErrorCode } from "./errors.js";

describe("gestion error mapping", () => {
  const expectedStatuses: Readonly<Record<ErrorCode, number>> = {
    VALIDATION_ERROR: 400,
    AUTHENTICATION_REQUIRED: 401,
    FORBIDDEN: 403,
    NOT_FOUND_OR_FORBIDDEN: 404,
    CONFLICT: 409,
    DEPENDENCY_UNAVAILABLE: 503,
    STORAGE_ERROR: 500,
    AUDIT_FAILURE: 500
  };

  it.each(Object.entries(expectedStatuses))("maps %s to HTTP %s", (code, status) => {
    const errorCode = code as ErrorCode;
    expect(getHttpStatus(errorCode)).toBe(status);
    expect(buildErrorEnvelope(errorCode)).toMatchObject({
      ok: false,
      error: { code: errorCode }
    });
  });

  it("exposes the closed eight-code catalog", () => {
    expect(Object.keys(ERROR_CODES)).toHaveLength(8);
  });
});
