// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../../src/lib/api/auth-store";
import { clearAuthToken, getAuthToken } from "../../src/lib/api/cookies";

const { pushMock, loginMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  loginMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

vi.mock("../../src/lib/api/auth-repository", () => ({
  authRepository: {
    login: loginMock,
    logout: vi.fn()
  }
}));

import LoginPage from "./page";

function okEnvelope<T>(data: T) {
  return { data, ok: true as const };
}

function errorEnvelope(code: string, message?: string) {
  return { error: { code, message }, ok: false as const };
}

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    loginMock.mockReset();
    useAuthStore.setState({
      actor: null,
      error: null,
      hasHydrated: true,
      isLoading: false,
      token: null
    });
    clearAuthToken();
    useAuthStore.setState({ token: null, actor: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renderiza los campos, el botón y el banner de desarrollo", () => {
    render(<LoginPage />);

    expect(screen.getByRole("textbox", { name: "Usuario" })).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
    expect(screen.getByText("Modo desarrollo, no productivo.")).toBeInTheDocument();
  });

  it("valida los campos vacíos sin llamar al repositorio", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(loginMock).not.toHaveBeenCalled();
    expect(screen.getByText("El usuario es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña es obligatoria.")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("guarda el token, persiste en localStorage y redirige a /app cuando el login es exitoso", async () => {
    const user = userEvent.setup();
    const token = "test-token-123";
    const actor = {
      id: "u_ana",
      name: "Ana Vendedora",
      role: "vendedor",
      username: "ana"
    };

    loginMock.mockResolvedValue(okEnvelope({ expiresAt: "2099-01-01T00:00:00Z", token, user: actor }));
    render(<LoginPage />);

    await user.type(screen.getByRole("textbox", { name: "Usuario" }), "ana");
    await user.type(screen.getByLabelText("Contraseña"), "ana-pass");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ password: "ana-pass", username: "ana" });
      expect(useAuthStore.getState().token).toBe(token);
      expect(useAuthStore.getState().actor).toEqual(actor);
      expect(getAuthToken()).toBe(token);
      expect(pushMock).toHaveBeenCalledWith("/app");
    });
  });

  it("muestra el error del servidor sin redirigir", async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValue(errorEnvelope("AUTHENTICATION_REQUIRED", "Credenciales inválidas."));
    render(<LoginPage />);

    await user.type(screen.getByRole("textbox", { name: "Usuario" }), "ana");
    await user.type(screen.getByLabelText("Contraseña"), "incorrecta");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Credenciales inválidas.");
    });
    expect(useAuthStore.getState().token).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
