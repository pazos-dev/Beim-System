// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardMetrics } from "../DashboardMetrics";

describe("DashboardMetrics", () => {
  it("shows four loading skeletons", () => {
    render(<DashboardMetrics isLoading />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getAllByTestId("metric-skeleton")).toHaveLength(4);
  });

  it("shows a recoverable error and invokes retry", () => {
    const onRetry = vi.fn();
    render(<DashboardMetrics error="No se pudo consultar el dashboard." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo consultar el dashboard.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
