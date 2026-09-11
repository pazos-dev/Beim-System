// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

import LoginPage from "./page";

describe("LoginPage panel de desarrollo", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("ya no expone el panel de acceso rápido de desarrollo", async () => {
    render(<LoginPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ingresar como/i })).not.toBeInTheDocument();
  });
});
