// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreateOrderButton } from "../CreateOrderButton";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

describe("CreateOrderButton", () => {
  it("is hidden when the role cannot create orders", () => {
    render(<CreateOrderButton visible={false} />);
    expect(screen.queryByRole("button", { name: "Crear orden" })).not.toBeInTheDocument();
  });

  it("renders the create button when allowed", () => {
    render(<CreateOrderButton visible />);
    expect(screen.getByRole("button", { name: "Crear orden" })).toBeInTheDocument();
  });
});