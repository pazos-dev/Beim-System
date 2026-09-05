import { describe, expect, it } from "vitest";

import { normalizeStateToken, STATE_TOKEN_VALUES } from "./state-tokens";

describe("repair state tokens", () => {
  it("normalizes accented input to the canonical token", () => {
    expect(normalizeStateToken("En reparación")).toBe("en_reparacion");
    expect(normalizeStateToken("Esperando Aprobación")).toBe("esperando_aprobacion");
    expect(normalizeStateToken("Control de calidad")).toBe("control_calidad");
    expect(normalizeStateToken("control de calidad")).toBe("control_calidad");
    expect(STATE_TOKEN_VALUES).toHaveLength(11);
  });

  it("rejects a state outside the catalog", () => {
    expect(normalizeStateToken("EN-DESPACHO")).toBeUndefined();
    expect(normalizeStateToken("ingresado")).toBeUndefined();
  });
});
