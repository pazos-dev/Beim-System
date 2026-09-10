import { describe, expect, it } from "vitest";

import { ConflictError, ValidationError } from "../../errors/taxonomy.js";
import {
  closeCashSession,
  openCashSession,
  recordMovement,
  type CashSession
} from "./cash-session.js";

function opened(overrides: Partial<CashSession> = {}): CashSession {
  return {
    id: "cs-1",
    businessDate: "2026-09-09",
    openingAmount: 1000,
    expectedAmount: 1000,
    countedAmount: null,
    difference: null,
    status: "open",
    notes: "",
    movements: [],
    ...overrides
  };
}

describe("CashSession aggregate (domain slice)", () => {
  it("opens with expected = opening and empty movements", () => {
    const session = openCashSession(
      { id: "cs-1", businessDate: "2026-09-09", openingAmount: 1000 },
      { hasOpenSession: false }
    );
    expect(session.status).toBe("open");
    expect(session.expectedAmount).toBe(1000);
    expect(session.movements).toEqual([]);
  });

  it("rejects double open with 409 leaving nothing to persist", () => {
    expect(() =>
      openCashSession(
        { id: "cs-2", businessDate: "2026-09-09", openingAmount: 500 },
        { hasOpenSession: true }
      )
    ).toThrow(ConflictError);
  });

  it("rejects malformed businessDate and negative opening with 422", () => {
    expect(() =>
      openCashSession(
        { id: "cs-1", businessDate: "09-09-2026", openingAmount: 0 },
        { hasOpenSession: false }
      )
    ).toThrow(ValidationError);
    expect(() =>
      openCashSession(
        { id: "cs-1", businessDate: "2026-09-09", openingAmount: -1 },
        { hasOpenSession: false }
      )
    ).toThrow(ValidationError);
  });

  it("records movements open-only adjusting expected", () => {
    const moved = recordMovement(opened(), "venta", 250);
    expect(moved.expectedAmount).toBe(1250);
    expect(moved.movements).toEqual([{ type: "venta", amount: 250 }]);
    expect(() => recordMovement(opened({ status: "closed" }), "venta", 250)).toThrow(
      ConflictError
    );
  });

  it("closes recording difference counted − expected", () => {
    const closed = closeCashSession(opened(), 990);
    expect(closed.status).toBe("closed");
    expect(closed.countedAmount).toBe(990);
    expect(closed.difference).toBe(-10);
  });

  it("rejects double close with 409 keeping the first count", () => {
    const closed = closeCashSession(opened(), 990);
    expect(() => closeCashSession(closed, 1000)).toThrow(ConflictError);
    expect(closed.countedAmount).toBe(990);
  });
});
