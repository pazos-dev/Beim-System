// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (...args: readonly unknown[]) => redirectMock(...args)
}));

import RootPage from "./page";

describe("RootPage", () => {
  it("redirige a /app", () => {
    RootPage();
    expect(redirectMock).toHaveBeenCalledWith("/app");
  });
});
