import { describe, expect, it } from "vitest";

import { clienteSchema } from "./schemas";

describe("clienteSchema document + active (CLI-1)", () => {
  it("defaults active to true for legacy records", () => {
    const parsed = clienteSchema.safeParse({
      id: "c_legacy",
      ownerId: "u-vendedor",
      version: 1,
      displayName: "Legacy"
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.active).toBe(true);
  });

  it("accepts an optional document between 1 and 40 chars", () => {
    const okValue = clienteSchema.safeParse({
      id: "c_1",
      ownerId: "u-vendedor",
      version: 1,
      displayName: "Ana",
      document: "12345678"
    });
    expect(okValue.success).toBe(true);
    const tooLong = clienteSchema.safeParse({
      id: "c_1",
      ownerId: "u-vendedor",
      version: 1,
      displayName: "Ana",
      document: "x".repeat(41)
    });
    expect(tooLong.success).toBe(false);
  });
});
