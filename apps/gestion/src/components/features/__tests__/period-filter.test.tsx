// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PeriodFilter, type Period } from "../PeriodFilter";

describe("PeriodFilter", () => {
  it("emits a period object when changing granularity and value", () => {
    const onChange = vi.fn();
    const value: Period = { type: "day", value: "2026-09-04" };
    const { rerender } = render(<PeriodFilter value={value} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Mes" }));
    expect(onChange).toHaveBeenLastCalledWith({ type: "month", value: "2026-09" });

    rerender(<PeriodFilter value={{ type: "month", value: "2026-09" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Valor del período"), {
      target: { value: "2026-10" }
    });
    expect(onChange).toHaveBeenLastCalledWith({ type: "month", value: "2026-10" });
  });
});
