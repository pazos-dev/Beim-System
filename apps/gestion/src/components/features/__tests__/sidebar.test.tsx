// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SIDEBAR_ICON_SIZE, SIDEBAR_STORAGE_KEY, Sidebar } from "../Sidebar";

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
    expect(screen.getByRole("button", { name: "Expandir menú" })).toHaveAttribute(
      "aria-controls",
      "gestion-sidebar-nav"
    );
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("true");

    firstRender.unmount();
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Expandir menú" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("renders one Lucide icon per module with the workshop size", () => {
    render(<Sidebar />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(8);
    for (const link of links) {
      const icon = link.querySelector("svg");
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute("width", String(SIDEBAR_ICON_SIZE));
      expect(icon).toHaveAttribute("height", String(SIDEBAR_ICON_SIZE));
    }
  });

  it("shows icon-only links with an accessible tooltip when collapsed", () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Contraer menú" }));

    const ordenes = screen.getByRole("link", { name: "Órdenes" });
    expect(ordenes).toHaveAttribute("aria-label", "Órdenes");
    expect(ordenes).not.toHaveAttribute("title");
    expect(ordenes.textContent).not.toMatch(/^O$/);
    const tooltip = within(ordenes).getByText("Órdenes", { selector: "span[aria-hidden='true']" });
    expect(tooltip).toBeInTheDocument();
  });
});
