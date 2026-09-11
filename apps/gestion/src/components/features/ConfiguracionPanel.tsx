"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useUiStore } from "../../lib/ui-store";
import { THEME_STORAGE_KEY, type Theme } from "../../lib/ui-slices/settings-slice";
import { useSessionSync } from "../SessionBootstrap";
import { Button } from "../ui/Button";
import { authRepository } from "../../lib/api/auth-repository";
import { useActor, useAuthStore } from "../../lib/api/auth-store";
import { clearAuthToken } from "../../lib/api-config";

// Kept so existing importers keep resolving the key from this module; the
// settings slice is the single source of truth for the value.
export { THEME_STORAGE_KEY };

const THEME = {
  CLARO: "claro",
  OSCURO: "oscuro",
  SISTEMA: "sistema"
} as const;

const THEME_OPTIONS: readonly { readonly label: string; readonly value: Theme }[] = [
  { label: "Claro", value: THEME.CLARO },
  { label: "Oscuro", value: THEME.OSCURO },
  { label: "Sistema", value: THEME.SISTEMA }
];

const ROUTES = {
  login: "/login"
} as const;

const COPY = {
  loadingUser: "Cargando usuario…",
  loginTitle: "Configuración",
  logoutPending: "Cerrando sesión…",
  logoutSubmit: "Cerrar sesión",
  logoutTitle: "Cerrar sesión",
  stubNote: "Más ajustes próximamente.",
  themeDescription: "Elegí cómo se ve la aplicación en este dispositivo.",
  themeTitle: "Tema",
  userError: "No se pudo cargar el usuario.",
  userTitle: "Usuario"
} as const;

function applyTheme(theme: Theme): void {
  const matchesDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", theme === THEME.OSCURO || (theme === THEME.SISTEMA && matchesDark));
}

function toDisplayActor(actor: NonNullable<ReturnType<typeof useActor>>) {
  return {
    displayName: actor.name,
    id: actor.id,
    role: actor.role,
    username: actor.username
  };
}

export function ConfiguracionPanel() {
  const router = useRouter();
  const authActor = useActor();
  const actor = authActor ? toDisplayActor(authActor) : null;
  const clearUser = useUiStore((state) => state.clearUser);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const sessionQuery = useSessionSync();
  const [isLogoutPending, setIsLogoutPending] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== THEME.SISTEMA || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(THEME.SISTEMA);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  function handleThemeChange(next: Theme): void {
    setTheme(next);
    applyTheme(next);
  }

  async function handleLogout(): Promise<void> {
    setIsLogoutPending(true);
    try {
      const token = useAuthStore.getState().token;
      if (token !== null) {
        // Se intenta notificar al backend; el cierre local no depende de la respuesta.
        await authRepository.logout(token);
      }
    } catch {
      // Ignorado: el token se limpia localmente de todos modos.
    } finally {
      useAuthStore.getState().clearAuth();
      clearAuthToken();
      clearUser();
      router.push(ROUTES.login);
      setIsLogoutPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Módulo</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{COPY.loginTitle}</h1>
      </header>
      <section aria-labelledby="config-usuario" className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-xl font-semibold text-ink" id="config-usuario">
          {COPY.userTitle}
        </h2>
        {actor ? (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink">
            <li>
              <span className="text-ink-muted">Nombre: </span>
              <strong>{actor.displayName}</strong>
            </li>
            <li>
              <span className="text-ink-muted">Usuario: </span>
              {actor.username}
            </li>
            <li>
              <span className="text-ink-muted">Rol: </span>
              {actor.role}
            </li>
          </ul>
        ) : sessionQuery.isError ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {COPY.userError}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-muted" role="status">
            {COPY.loadingUser}
          </p>
        )}
        <p className="mt-4 text-sm text-ink-muted" role="note">
          {COPY.stubNote}
        </p>
      </section>
      <section aria-labelledby="config-tema" className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-xl font-semibold text-ink" id="config-tema">
          {COPY.themeTitle}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">{COPY.themeDescription}</p>
        <div aria-label="Tema de la aplicación" className="mt-4 flex gap-2" role="radiogroup">
          {THEME_OPTIONS.map((option) => (
            <label
              className="cursor-pointer rounded-md border border-line bg-surface-muted px-4 py-2 text-sm font-medium text-ink transition-colors has-checked:border-brand has-checked:bg-brand/10 has-checked:text-brand-strong"
              key={option.value}
            >
              <input
                checked={theme === option.value}
                className="sr-only"
                name="tema"
                onChange={() => handleThemeChange(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>
      <section aria-labelledby="config-sesion" className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-xl font-semibold text-ink" id="config-sesion">
          {COPY.logoutTitle}
        </h2>
        <div className="mt-4">
          <Button disabled={isLogoutPending} onClick={() => void handleLogout()} variant="secondary">
            {isLogoutPending ? COPY.logoutPending : COPY.logoutSubmit}
          </Button>
        </div>
      </section>
    </div>
  );
}
