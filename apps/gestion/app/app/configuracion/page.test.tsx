// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ConfiguracionPage from "./page";
import { THEME_STORAGE_KEY } from "../../../src/components/features/ConfiguracionPanel";
import { useAuthStore } from "../../../src/lib/api/auth-store";
import { useUiStore } from "../../../src/lib/ui-store";
import { renderWithQueryClient } from "../../../src/test/query-client";

const { pushMock, logoutMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  logoutMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock("../../../src/lib/api/auth-repository", () => ({
  authRepository: {
    login: vi.fn(),
    logout: logoutMock
  }
}));

const ACTOR = {
  displayName: "Ana Vendedora",
  id: "u_ana",
  name: "Ana Vendedora",
  role: "vendedor",
  username: "ana"
};

describe("ConfiguracionPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    logoutMock.mockReset();
    useUiStore.setState({ actor: null, theme: "sistema" });
    useAuthStore.setState({
      actor: ACTOR,
      error: null,
      hasHydrated: true,
      isLoading: false,
      token: "valid-token"
    });
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
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
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("oscuro");

    await user.click(screen.getByRole("radio", { name: "Claro" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("claro");
  });

  it("cierra la sesión, llama al backend y redirige a /login", async () => {
    logoutMock.mockResolvedValue({ ok: true, data: { loggedOut: true } });
    const user = userEvent.setup();
    renderWithQueryClient(<ConfiguracionPage />);
    await screen.findByText("Ana Vendedora");

    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledWith("valid-token");
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().actor).toBeNull();
  });
});
