// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
import LoginPage from "./page";
const fetchMock = vi.fn();
function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" }, status });
}
const DEV_USERS = [
  { username: "vendedor", displayName: "Persona vendedora", role: "vendedor", permissions: ["orders.create"] },
  { username: "caja", displayName: "Persona de caja", role: "caja", permissions: ["cash.manage"] }
];
describe("LoginPage panel de desarrollo", () => {
  beforeEach(() => {
    pushMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("muestra usuarios de desarrollo y entra con un clic sin credenciales", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(jsonResponse(url.includes("/api/gestion/dev/login") ? { ok: true, data: { username: "vendedor" } } : DEV_USERS, 200))
    );
    render(<LoginPage />);
    await user.click(await screen.findByRole("button", { name: /ingresar como persona vendedora/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/gestion/dev/login", expect.objectContaining({ body: JSON.stringify({ username: "vendedor" }), method: "POST" }));
      expect(pushMock).toHaveBeenCalledWith("/app");
    });
    expect(fetchMock.mock.calls.map((call) => String(call[1]?.body ?? "")).join(" ")).not.toContain("credential");
  });
  it("queda como hoy cuando el endpoint de desarrollo no está disponible", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false }, 403));
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ingresar como/i })).not.toBeInTheDocument();
  });
});
