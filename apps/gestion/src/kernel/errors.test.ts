import { describe, expect, it } from "vitest";

import { ERROR_CODE_VALUES } from "../server/data/schemas";
import { createGestionError, ERROR_CODES } from "./errors";

describe("kernel errors", () => {
  it("keeps error codes stable against the frozen schema set", () => {
    expect([...Object.values(ERROR_CODES)]).toEqual([...ERROR_CODE_VALUES]);
  });

  it("creates errors with stable codes and default messages", () => {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);

    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("attaches details only when provided", () => {
    const plain = createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN);
    const detailed = createGestionError(ERROR_CODES.FORBIDDEN, { action: "caja.cerrar" });

    expect(plain.details).toBeUndefined();
    expect(detailed.details).toEqual({ action: "caja.cerrar" });
  });
});
