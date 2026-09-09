// @vitest-environment jsdom
// Bearer transport (PR2): the panel reads the actor synchronously from the
// memory-only session slice (a reload starts logged out) and logs out through
// `POST {base}/auth/logout`. Zero sockets beyond the stubbed recorded logout.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

import ConfiguracionPage from "./page";
import { LOGOUT_PATH } from "../../../src/hooks/useSession";
import { resolveApiBaseUrl } from "../../../src/lib/http/api-config";
import { useSessionStore, type UserActor } from "../../../src/store/session.slice";
import { THEME_STORAGE_KEY, useThemeStore } from "../../../src/store/theme.slice";
import logoutFixture from "../../../src/test/fixtures/http/logout.json";
import { renderWithQueryClient } from "../../../src/test/query-client";

const fetchMock = vi.fn();

const ACTOR: UserActor = { displayName: "Ana Vendedora", id: "u_ana", role: "vendedor", username: "ana" };
const TOKEN = "recorded-dev-token";

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
    useSessionStore.getState().setSession(ACTOR, TOKEN);
    useThemeStore.setState({ theme: "sistema" });
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    fetchMock.mockImplementation((input: unknown) => {
      const url = typeof input === "string" ? input : String(input);
      if (url.endsWith(LOGOUT_PATH)) return Promise.resolve(Response.json(logoutFixture));
      return Promise.resolve(Response.json({ error: { code: "not-found" }, ok: false }, { status: 404 }));
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

  it("muestra el aviso de sesión cuando no hay actor", async () => {
    useSessionStore.setState({ actor: null, token: null });
    renderWithQueryClient(<ConfiguracionPage />);

    expect(await screen.findByText("No hay sesión activa.")).toBeInTheDocument();
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
        `${resolveApiBaseUrl()}${LOGOUT_PATH}`,
        expect.objectContaining({
          headers: expect.objectContaining({ authorization: `Bearer ${TOKEN}` }),
          method: "POST"
        })
      );
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
    await waitFor(() => expect(useSessionStore.getState().actor).toBeNull());
    expect(useSessionStore.getState().token).toBeNull();
    expect(useThemeStore.getState().theme).toBe("sistema");
  });
});
