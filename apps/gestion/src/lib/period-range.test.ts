import { describe, expect, it } from "vitest";

import { periodToRange } from "./period-range";

const TODAY = new Date(Date.UTC(2026, 8, 8));

describe("periodToRange", () => {
  it("maps a day period to a single-day range", () => {
    expect(periodToRange({ type: "day", value: "2026-09-08" }, TODAY)).toEqual({
      desde: "2026-09-08",
      hasta: "2026-09-08"
    });
  });

  it("maps a month period to the full month including leap February", () => {
    expect(periodToRange({ type: "month", value: "2024-02" }, TODAY)).toEqual({
      desde: "2024-02-01",
      hasta: "2024-02-29"
    });
  });

  it("maps a year period to the full year", () => {
    expect(periodToRange({ type: "year", value: "2026" }, TODAY)).toEqual({
      desde: "2026-01-01",
      hasta: "2026-12-31"
    });
  });

  it("falls back to the current month for empty or invalid values", () => {
    expect(periodToRange({ type: "day", value: "" }, TODAY)).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30"
    });
    expect(periodToRange({ type: "month", value: "2026-13" }, TODAY)).toEqual({
      desde: "2026-09-01",
      hasta: "2026-09-30"
    });
  });
});
