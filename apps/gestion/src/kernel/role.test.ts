import { describe, expect, it } from "vitest";

import { ROLE_VALUES as FROZEN_ROLE_VALUES } from "../server/shared/auth";
import { isRole, ROLE_VALUES } from "./role";

describe("kernel role", () => {
  it("pins the frozen API role set", () => {
    expect([...ROLE_VALUES]).toEqual([...FROZEN_ROLE_VALUES]);
  });

  it("exposes exactly five roles", () => {
    expect(ROLE_VALUES).toHaveLength(5);
  });

  it("accepts known roles and rejects unknown values", () => {
    expect(isRole("vendedor")).toBe(true);
    expect(isRole("administrador_principal")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
