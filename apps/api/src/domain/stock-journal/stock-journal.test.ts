import { describe, expect, it } from "vitest";
import { listJournalEntries, recordStockMovement } from "./stock-journal.js";

describe("stock-journal", () => {
  it("records a movement without mutating stock", () => {
    const entry = recordStockMovement({ productId: "p-1", movementType: "venta", quantity: 2 });
    expect(entry.productId).toBe("p-1");
    expect(entry.quantity).toBe(2);
  });

  it("rejects non-positive quantity", () => {
    expect(() => recordStockMovement({ productId: "p-1", movementType: "venta", quantity: 0 })).toThrow();
  });

  it("lists ordered without mutating input", () => {
    const b = recordStockMovement({ productId: "p-1", movementType: "b", quantity: 1, createdAt: new Date("2026-02-02") });
    const a = recordStockMovement({ productId: "p-1", movementType: "a", quantity: 1, createdAt: new Date("2026-01-01") });
    const listed = listJournalEntries([b, a]);
    expect(listed.map((e) => e.movementType)).toEqual(["a", "b"]);
    expect([b, a].map((e) => e.movementType)).toEqual(["b", "a"]);
  });
});
