// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SIDEBAR_STORAGE_KEY, Sidebar } from "../Sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/clientes"
}));

describe("Sidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("marks the active route and restores its collapsed UI preference", () => {
    const firstRender = render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Órdenes" })).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByRole("button", { name: "Contraer menú" }));
    expect(screen.getByRole("button", { name: "Expandir menú" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("true");

    firstRender.unmount();
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Expandir menú" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
