// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

import ConfiguracionPage from "./page";
import { THEME_STORAGE_KEY } from "../../../src/components/features/ConfiguracionPanel";

const fetchMock = vi.fn();

const ACTOR = { displayName: "Ana Vendedora", role: "vendedor", username: "ana" };

describe("ConfiguracionPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    fetchMock.mockImplementation((input: unknown) => {
      const url = typeof input === "string" ? input : String(input);
      const payload = url === "/api/gestion/auth/logout" ? { data: {}, ok: true } : { data: ACTOR, ok: true };
      return Promise.resolve(Response.json(payload, { status: 200 }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra el usuario actual y el aviso de ajustes futuros", async () => {
    render(<ConfiguracionPage />);

    expect(await screen.findByText("Ana Vendedora")).toBeInTheDocument();
    expect(screen.getByText("ana")).toBeInTheDocument();
    expect(screen.getByText("vendedor")).toBeInTheDocument();
    expect(screen.getByText("Más ajustes próximamente.")).toBeInTheDocument();
  });

  it("persiste el tema en localStorage y aplica la clase dark", async () => {
    const user = userEvent.setup();
    render(<ConfiguracionPage />);
    await screen.findByText("Ana Vendedora");

    await user.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("oscuro");

    await user.click(screen.getByRole("radio", { name: "Claro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("claro");
  });

  it("cierra la sesión y redirige a /login", async () => {
    const user = userEvent.setup();
    render(<ConfiguracionPage />);
    await screen.findByText("Ana Vendedora");

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gestion/auth/logout",
        expect.objectContaining({ method: "POST" })
      );
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
  });
});
