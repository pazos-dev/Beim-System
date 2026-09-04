// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

import LoginPage from "./page";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
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

  it("valida los campos vacíos sin llamar al servidor", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("El usuario es obligatorio.")).toBeInTheDocument();
    expect(screen.getByText("La contraseña es obligatoria.")).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirige a /app cuando el login es exitoso", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { username: "dev-vendedor" }, ok: true }, 200)
    );
    render(<LoginPage />);

    await user.type(screen.getByRole("textbox", { name: "Usuario" }), "dev-vendedor");
    await user.type(screen.getByLabelText("Contraseña"), "dev-vendedor");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/gestion/auth/login",
        expect.objectContaining({
          body: JSON.stringify({ credential: "dev-vendedor", username: "dev-vendedor" }),
          method: "POST"
        })
      );
      expect(pushMock).toHaveBeenCalledWith("/app");
    });
  });

  it("muestra el error del servidor sin redirigir", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "AUTHENTICATION_REQUIRED", message: "Credenciales inválidas." }, ok: false },
        401
      )
    );
    render(<LoginPage />);

    await user.type(screen.getByRole("textbox", { name: "Usuario" }), "dev-vendedor");
    await user.type(screen.getByLabelText("Contraseña"), "incorrecta");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Credenciales inválidas.");
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
