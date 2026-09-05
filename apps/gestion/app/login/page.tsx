"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";

const ROUTES = {
  appHome: "/app",
  loginApi: "/api/gestion/auth/login",
  devUsersApi: "/api/gestion/dev/users",
  devLoginApi: "/api/gestion/dev/login"
} as const;

const COPY = {
  banner: "Modo desarrollo, no productivo.",
  credentialRequired: "La contraseña es obligatoria.",
  devError: "No se pudo ingresar con ese usuario. Probá de nuevo.",
  devLoading: "Cargando usuarios de desarrollo…",
  devSubtitle: "Solo disponible en desarrollo. Ingresá con un clic, sin contraseña.",
  devTitle: "Acceso rápido",
  fallbackError: "No se pudo iniciar sesión. Verificá los datos e intentá de nuevo.",
  passwordLabel: "Contraseña",
  submit: "Ingresar",
  submitting: "Ingresando…",
  subtitle: "Accedé al panel de gestión con tu usuario.",
  title: "Iniciar sesión",
  usernameLabel: "Usuario",
  usernameRequired: "El usuario es obligatorio."
} as const;

interface LoginFormState {
  readonly credential: string;
  readonly username: string;
}

interface DevUser {
  readonly username: string;
  readonly displayName: string;
  readonly role: string;
  readonly permissions: readonly string[];
}

const INITIAL_FORM_STATE: LoginFormState = { credential: "", username: "" };

function isDevUser(value: unknown): value is DevUser {
  return (
    isRecord(value) &&
    typeof value.username === "string" &&
    typeof value.displayName === "string" &&
    typeof value.role === "string" &&
    Array.isArray(value.permissions) &&
    value.permissions.every((permission) => typeof permission === "string")
  );
}

function isDevUserList(value: unknown): value is DevUser[] {
  return Array.isArray(value) && value.every(isDevUser);
}

function summarizePermissions(permissions: readonly string[]): string {
  if (permissions.length === 0) return "Sin permisos asignados.";
  const shown = permissions.slice(0, 3).join(", ");
  return permissions.length > 3 ? `${shown} (+${permissions.length - 3} más)` : shown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSuccessEnvelope(payload: unknown): payload is { readonly data: unknown; readonly ok: true } {
  return isRecord(payload) && payload.ok === true;
}

function extractErrorMessage(payload: unknown): string | null {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    const message = payload.error.message.trim();
    return message.length > 0 ? message : null;
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [usernameError, setUsernameError] = useState<string | undefined>(undefined);
  const [credentialError, setCredentialError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const [isDevLoading, setIsDevLoading] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [devPending, setDevPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDevUsers(): Promise<void> {
      setIsDevLoading(true);
      try {
        const response = await fetch(ROUTES.devUsersApi);
        if (!response.ok) return;
        const payload: unknown = await response.json().catch(() => null);
        if (!cancelled && isDevUserList(payload)) setDevUsers(payload);
      } catch {
        return;
      } finally {
        if (!cancelled) setIsDevLoading(false);
      }
    }
    void loadDevUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDevLogin(username: string): Promise<void> {
    setDevPending(username);
    setDevError(null);
    try {
      const response = await fetch(ROUTES.devLoginApi, {
        body: JSON.stringify({ username }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessEnvelope(payload)) {
        setDevError(extractErrorMessage(payload) ?? COPY.devError);
        return;
      }
      router.push(ROUTES.appHome);
    } catch {
      setDevError(COPY.devError);
    } finally {
      setDevPending(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const nextUsernameError = form.username.trim() ? undefined : COPY.usernameRequired;
    const nextCredentialError = form.credential ? undefined : COPY.credentialRequired;
    setUsernameError(nextUsernameError);
    setCredentialError(nextCredentialError);
    if (nextUsernameError !== undefined || nextCredentialError !== undefined) {
      return;
    }

    setIsPending(true);
    setFormError(null);
    try {
      const response = await fetch(ROUTES.loginApi, {
        body: JSON.stringify({ credential: form.credential, username: form.username.trim() }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isSuccessEnvelope(payload)) {
        setFormError(extractErrorMessage(payload) ?? COPY.fallbackError);
        return;
      }
      router.push(ROUTES.appHome);
    } catch {
      setFormError(COPY.fallbackError);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <div
        className="border-b border-brand/20 bg-brand/10 px-4 py-2 text-center text-xs font-semibold tracking-wide text-brand-strong"
        role="note"
      >
        {COPY.banner}
      </div>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-3xl flex-col items-stretch justify-center gap-6 lg:flex-row">
        <section
          aria-labelledby="login-title"
          className="w-full max-w-md flex-1 rounded-xl border border-line bg-surface p-6 shadow-sm"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-ink" id="login-title">
            {COPY.title}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{COPY.subtitle}</p>
          <form className="mt-6 flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
            <Input
              autoComplete="username"
              disabled={isPending}
              error={usernameError}
              id="login-username"
              label={COPY.usernameLabel}
              name="username"
              onChange={(event) =>
                setForm((current) => ({ ...current, username: event.target.value }))
              }
              required
              value={form.username}
            />
            <Input
              autoComplete="current-password"
              disabled={isPending}
              error={credentialError}
              id="login-credential"
              label={COPY.passwordLabel}
              name="password"
              onChange={(event) =>
                setForm((current) => ({ ...current, credential: event.target.value }))
              }
              required
              type="password"
              value={form.credential}
            />
            {formError ? (
              <p aria-live="assertive" className="text-sm text-danger" role="alert">
                {formError}
              </p>
            ) : null}
            <Button disabled={isPending} type="submit">
              {isPending ? COPY.submitting : COPY.submit}
            </Button>
          </form>
        </section>
        {devUsers ? (
          <aside
            aria-label="Acceso rápido de desarrollo"
            className="w-full max-w-md flex-1 rounded-xl border border-line bg-surface p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold tracking-tight text-ink">{COPY.devTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{COPY.devSubtitle}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {devUsers.map((devUser) => (
                <li key={devUser.username}>
                  <button
                    aria-label={`Ingresar como ${devUser.displayName} (${devUser.username})`}
                    className="flex w-full flex-col gap-0.5 rounded-md border border-line bg-surface-muted px-3 py-2 text-left text-sm transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={devPending !== null}
                    onClick={() => void handleDevLogin(devUser.username)}
                    type="button"
                  >
                    <span className="font-semibold text-ink">
                      {devPending === devUser.username ? COPY.devLoading : devUser.displayName}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {devUser.role} · {summarizePermissions(devUser.permissions)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {devError ? (
              <p aria-live="assertive" className="mt-3 text-sm text-danger" role="alert">
                {devError}
              </p>
            ) : null}
          </aside>
        ) : null}
        {isDevLoading ? (
          <p aria-live="polite" className="sr-only" role="status">
            {COPY.devLoading}
          </p>
        ) : null}
        </div>
      </main>
    </div>
  );
}
