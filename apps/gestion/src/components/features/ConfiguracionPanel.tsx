"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../ui/Button";

const THEME = {
  CLARO: "claro",
  OSCURO: "oscuro",
  SISTEMA: "sistema"
} as const;

type Theme = (typeof THEME)[keyof typeof THEME];

export const THEME_STORAGE_KEY = "gestion-theme";

const THEME_OPTIONS: readonly { readonly label: string; readonly value: Theme }[] = [
  { label: "Claro", value: THEME.CLARO },
  { label: "Oscuro", value: THEME.OSCURO },
  { label: "Sistema", value: THEME.SISTEMA }
];

const ROUTES = {
  login: "/login",
  logoutApi: "/api/gestion/auth/logout",
  sessionApi: "/api/gestion/auth/session"
} as const;

const COPY = {
  loadingUser: "Cargando usuario…",
  loginTitle: "Configuración",
  logoutError: "No se pudo cerrar la sesión. Intentá de nuevo.",
  logoutPending: "Cerrando sesión…",
  logoutSubmit: "Cerrar sesión",
  logoutTitle: "Cerrar sesión",
  stubNote: "Más ajustes próximamente.",
  themeDescription: "Elegí cómo se ve la aplicación en este dispositivo.",
  themeTitle: "Tema",
  userError: "No se pudo cargar el usuario.",
  userTitle: "Usuario"
} as const;

interface SessionActor {
  readonly displayName: string;
  readonly role: string;
  readonly username: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionActor(value: unknown): value is SessionActor {
  return (
    isRecord(value) &&
    typeof value.displayName === "string" &&
    typeof value.username === "string" &&
    typeof value.role === "string"
  );
}

function isSuccessEnvelope(payload: unknown): payload is { readonly data: unknown; readonly ok: true } {
  return isRecord(payload) && payload.ok === true;
}

function applyTheme(theme: Theme): void {
  const matchesDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", theme === THEME.OSCURO || (theme === THEME.SISTEMA && matchesDark));}

function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === THEME.CLARO || stored === THEME.OSCURO || stored === THEME.SISTEMA) return stored;
  } catch {
    // El almacenamiento es solo una preferencia visual; su fallo no bloquea.
  }
  return THEME.SISTEMA;
}

export function ConfiguracionPanel() {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(THEME.SISTEMA);
  const [actor, setActor] = useState<SessionActor | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [isLogoutPending, setIsLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored);
    applyTheme(stored);
    if (stored !== THEME.SISTEMA || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(THEME.SISTEMA);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSession(): Promise<void> {
      try {
        const response = await fetch(ROUTES.sessionApi, { cache: "no-store" });
        const payload: unknown = await response.json().catch(() => null);
        if (!active) return;
        if (response.ok && isSuccessEnvelope(payload) && isSessionActor(payload.data)) {
          setActor(payload.data);
        } else {
          setUserError(COPY.userError);
        }
      } catch {
        if (active) setUserError(COPY.userError);
      }
    }
    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  function handleThemeChange(next: Theme): void {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Solo preferencia visual; el fallo no bloquea la aplicación del tema.
    }
    applyTheme(next);
  }

  async function handleLogout(): Promise<void> {
    setIsLogoutPending(true);
    setLogoutError(null);
    try {
      const response = await fetch(ROUTES.logoutApi, { method: "POST" });
      if (!response.ok) {
        setLogoutError(COPY.logoutError);
        return;
      }
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
        ) : userError ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {userError}
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
