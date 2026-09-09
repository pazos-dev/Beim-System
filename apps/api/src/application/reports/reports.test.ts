import { describe, expect, it, vi } from "vitest";
import type { ReportsReader } from "./reports.js";
import { DEFAULT_TOP_LIMIT, MAX_TOP_LIMIT, makeReportHandlers } from "./reports.js";

const RANGE = { from: "2026-08-11", to: "2026-09-09" };

function baseReader(): ReportsReader {
  return {
    salesSummary: vi.fn(async (range: unknown) => ({ range })),
    stockValuation: vi.fn(async () => ({ totalValuation: 0 })),
    cashSummary: vi.fn(async (range: unknown) => ({ range })),
    topProducts: vi.fn(async (query: unknown) => ({ query })),
    repairsByStatus: vi.fn(async () => ({ total: 0 }))
  };
}

describe("report handlers (thin delegation over the read port)", () => {
  it("forwards the range to the reader for sales-summary and cash-summary", async () => {
    const reader = baseReader();
    const handlers = makeReportHandlers(reader);
    await handlers.salesSummary(RANGE);
    await handlers.cashSummary(RANGE);
    expect(reader.salesSummary).toHaveBeenCalledWith(RANGE);
    expect(reader.cashSummary).toHaveBeenCalledWith(RANGE);
  });

  it("delegates stock-valuation and repairs-by-status without input", async () => {
    const reader = baseReader();
    const handlers = makeReportHandlers(reader);
    await handlers.stockValuation();
    await handlers.repairsByStatus();
    expect(reader.stockValuation).toHaveBeenCalledWith();
    expect(reader.repairsByStatus).toHaveBeenCalledWith();
  });

  it("clamps the top-products limit to the legacy default/max contract", async () => {
    const reader = baseReader();
    const handlers = makeReportHandlers(reader);
    await handlers.topProducts({ ...RANGE });
    await handlers.topProducts({ ...RANGE, limit: 500 });
    expect(reader.topProducts).toHaveBeenCalledWith({ ...RANGE, limit: DEFAULT_TOP_LIMIT });
    expect(reader.topProducts).toHaveBeenCalledWith({ ...RANGE, limit: MAX_TOP_LIMIT });
  });

  it("bubbles reader failures by identity (no error remap)", async () => {
    const failure = new Error("db down");
    const reader = baseReader();
    reader.salesSummary = vi.fn(async () => {
      throw failure;
    });
    await expect(makeReportHandlers(reader).salesSummary(RANGE)).rejects.toBe(failure);
  });
});
