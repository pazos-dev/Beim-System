import { describe, expect, it } from "vitest";

import type { Uuid } from "../../domain/shared/types.js";
import { SystemUuid } from "./system-uuid.js";

/** Unit 1 foundation: uuid adapter behind the domain `Uuid` port. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("SystemUuid", () => {
  it("implements the domain Uuid port", () => {
    // Arrange
    const uuid: Uuid = new SystemUuid();

    // Act
    const value = uuid.generate();

    // Assert
    expect(value).toMatch(UUID_PATTERN);
  });

  it("generates unique values on every call", () => {
    // Arrange
    const uuid = new SystemUuid();

    // Act
    const values = new Set([uuid.generate(), uuid.generate(), uuid.generate()]);

    // Assert
    expect(values.size).toBe(3);
  });
});
