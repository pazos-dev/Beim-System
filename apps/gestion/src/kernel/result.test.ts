import { describe, expect, it } from "vitest";

import { err, isOk, ok } from "./result";

describe("kernel result", () => {
  it("wraps values with ok without throwing", () => {
    const result = ok("actor-1");

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("actor-1");
  });

  it("matches errors with err without throwing", () => {
    const failure = err({ code: "FORBIDDEN" } as const);

    expect(isOk(failure)).toBe(false);
    if (!isOk(failure)) expect(failure.error.code).toBe("FORBIDDEN");
  });
});
