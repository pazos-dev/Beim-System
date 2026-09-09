import { describe, expect, it } from "vitest";

import { AppError } from "../../errors/AppError.js";
import { MESSAGE_BY_CODE } from "../../errors/taxonomy.js";
import { toAppError as canonicalToAppError } from "../persistence/error-map.js";
import { toAppError } from "./toAppError.js";

/**
 * Unit 1 foundation (task 1.2, reconciled with slice 0.2): the error
 * boundary lives in `infrastructure/persistence/error-map.ts`; this module
 * is a thin facade so adapter code imports it from `infrastructure/errors/`.
 * The full code matrix lives in `error-map.test.ts` — here the boundary
 * contract is pinned: frozen messages only, zero driver text (zero PII).
 */
function driverError(code: string, extra: Record<string, unknown> = {}): unknown {
  return { name: "DatabaseError", code, ...extra };
}

describe("toAppError facade (task 1.2)", () => {
  it("re-exports the canonical 0.2 mapper (single implementation, no fork)", () => {
    expect(toAppError).toBe(canonicalToAppError);
  });

  it("maps 23505 to CONFLICT 409 with the frozen message", () => {
    const mapped = toAppError(driverError("23505"));

    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.CONFLICT);
    expect(mapped.details).toBeUndefined();
  });

  it("maps FK 23503 dependents to 409 and missing parents to 404", () => {
    const conflict = toAppError(
      driverError("23503", { detail: 'Key (id)=(1) is still referenced from table "orders".' })
    );
    const missing = toAppError(
      driverError("23503", { detail: 'Key (product_id)=(x) is not present in table "products".' })
    );

    expect(conflict.code).toBe("CONFLICT");
    expect(conflict.status).toBe(409);
    expect(missing.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    expect(missing.status).toBe(404);
  });

  it.each(["40P01", "55P03"])("maps lock conflict %s to CONFLICT 409", (code) => {
    const mapped = toAppError(driverError(code));

    expect(mapped.code).toBe("CONFLICT");
    expect(mapped.status).toBe(409);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.CONFLICT);
    expect(mapped.details).toBeUndefined();
  });

  it("maps unknown failures to INTERNAL_ERROR 500 with the frozen message", () => {
    const mapped = toAppError(new Error("boom"));

    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.status).toBe(500);
    expect(mapped.message).toBe(MESSAGE_BY_CODE.INTERNAL_ERROR);
    expect(mapped.details).toBeUndefined();
  });

  it("strips PII and driver internals (email, constraint, detail) from every mapping", () => {
    const leak = "ana@example.com";
    const cases = [
      driverError("23505", {
        constraint: "users_email_key",
        detail: `Key (email)=(${leak}) already exists.`
      }),
      driverError("23503", { detail: `Key (id)=(${leak}) is still referenced from table "orders".` }),
      driverError("23503", { detail: `Key (product_id)=(${leak}) is not present in table "products".` }),
      driverError("XX999", { message: `secreto de conexión ${leak}` })
    ];

    for (const err of cases) {
      const serialized = JSON.stringify(toAppError(err));
      expect(serialized).not.toContain(leak);
      expect(serialized).not.toContain("users_email_key");
    }
  });
});
