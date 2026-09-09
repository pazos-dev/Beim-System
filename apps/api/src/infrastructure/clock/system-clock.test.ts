import { describe, expect, it } from "vitest";

import type { Clock } from "../../domain/shared/types.js";
import { SystemClock } from "./system-clock.js";

/**
 * Unit 1 foundation: wall-clock adapter behind the domain `Clock` port.
 * Handlers keep injecting stub clocks; this adapter is the production
 * binding only (no test may depend on the real wall clock).
 */
describe("SystemClock", () => {
  it("implements the domain Clock port", () => {
    // Arrange
    const clock: Clock = new SystemClock();

    // Act
    const now = clock.now();

    // Assert
    expect(now).toBeInstanceOf(Date);
  });

  it("reads the current wall-clock time (within test skew)", () => {
    // Arrange
    const clock = new SystemClock();
    const before = Date.now();

    // Act
    const now = clock.now().getTime();

    // Assert
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
