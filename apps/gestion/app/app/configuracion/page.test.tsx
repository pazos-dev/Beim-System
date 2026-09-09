// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

import ConfiguracionPage from "./page";
import { useSessionStore } from "../../../src/store/session.slice";
import { THEME_STORAGE_KEY, useThemeStore } from "../../../src/store/theme.slice";
import { renderWithQueryClient } from "../../../src/test/query-client";

const fetchMock = vi.fn();

const ACTOR = { displayName: "Ana Vendedora", id: "u_ana", role: "vendedor", username: "ana" };

function storedTheme(): string | null {
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === null) return null;
  try {
    return (JSON.parse(raw) as { state?: { theme?: string } }).state?.theme ?? null;
  } catch {
    return null;
  }
}

describe("ConfiguracionPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    useSessionStore.setState({ actor: null });
    useThemeStore.setState({ theme: "sistema" });
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    fetchMock.mockImplementation((input: unknown) => {
      const url = typeof input === "string" ? input : String(input);
      const payload = { data: ACTOR, ok: true };
      void url;
      return Promise.resolve(Response.json(payload, { status: 200 }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra el usuario actual y el aviso de ajustes futuros", async () => {
    renderWithQueryClient(<ConfiguracionPage />);

    expect(await screen.findByText("Ana Vendedora")).toBeInTheDocument();
    expect(screen.getByText("ana")).toBeInTheDocument();
    expect(screen.getByText("vendedor")).toBeInTheDocument();
    expect(screen.getByText("Más ajustes próximamente.")).toBeInTheDocument();
  });

  it("persiste el tema en localStorage y aplica la clase dark", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ConfiguracionPage />);
    await screen.findByText("Ana Vendedora");

    await user.click(screen.getByRole("radio", { name: "Oscuro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useThemeStore.getState().theme).toBe("oscuro");
    expect(storedTheme()).toBe("oscuro");

    await user.click(screen.getByRole("radio", { name: "Claro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(useThemeStore.getState().theme).toBe("claro");
    expect(storedTheme()).toBe("claro");
  });

  it("cierra la sesión y redirige a /login", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ConfiguracionPage />);
    await screen.findByText("Ana Vendedora");

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gestion/auth/logout",
        expect.objectContaining({ method: "POST" })
      );
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
    await waitFor(() => expect(useSessionStore.getState().actor).toBeNull());
    expect(useThemeStore.getState().theme).toBe("sistema");
  });
});
