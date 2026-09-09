"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useSessionSync, useLogout } from "../../hooks/useSession";
import { useSessionStore } from "../../store/session.slice";
import { useThemeStore, type Theme } from "../../store/theme.slice";
import { Button } from "../ui/Button";

// Kept so existing importers keep resolving the key from this module; the
// canonical theme slice (`gestion-theme-v1`) is the single source of truth.
export { THEME_STORAGE_KEY } from "../../store/theme.slice";

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
  loggedOutUser: "No hay sesión activa.",
  loginTitle: "Configuración",
  logoutError: "No se pudo cerrar la sesión. Intentá de nuevo.",
  logoutPending: "Cerrando sesión…",
  logoutSubmit: "Cerrar sesión",
  logoutTitle: "Cerrar sesión",
  stubNote: "Más ajustes próximamente.",
  themeDescription: "Elegí cómo se ve la aplicación en este dispositivo.",
  themeTitle: "Tema",
  userTitle: "Usuario"
} as const;

function applyTheme(theme: Theme): void {
  const matchesDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", theme === THEME.OSCURO || (theme === THEME.SISTEMA && matchesDark));}

export function ConfiguracionPanel() {
  const router = useRouter();
  const actor = useSessionStore((state) => state.actor);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const logout = useLogout();
  // Bearer transport: the actor reads synchronously from the memory-only
  // session slice (a reload starts logged out); no session query to observe.
  useSessionSync();
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

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
    setLogoutError(null);
    try {
      // The hook clears the session actor and invalidates ['bootstrap'];
      // theme prefs survive because the theme slice is never touched.
      await logout.mutateAsync();
      router.push(ROUTES.login);
    } catch {
      setLogoutError(COPY.logoutError);
    } finally {
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
        ) : (
          <p className="mt-3 text-sm text-ink-muted" role="status">
            {COPY.loggedOutUser}
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
        {logoutError ? (
          <p aria-live="assertive" className="mt-3 text-sm text-danger" role="alert">
            {logoutError}
          </p>
        ) : null}
        <div className="mt-4">
          <Button disabled={isLogoutPending} onClick={() => void handleLogout()} variant="secondary">
            {isLogoutPending ? COPY.logoutPending : COPY.logoutSubmit}
          </Button>
        </div>
      </section>
    </div>
  );
}
