// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GlobalSearch } from "../GlobalSearch";

describe("GlobalSearch", () => {
  it("debounces the bounded search callback", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<GlobalSearch onSearch={onSearch} debounceMs={250} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar" }), {
      target: { value: "cliente" }
    });
    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(onSearch).toHaveBeenCalledWith("cliente");
    vi.useRealTimers();
  });
});
