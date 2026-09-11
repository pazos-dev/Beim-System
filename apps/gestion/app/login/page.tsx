"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { authRepository } from "../../src/lib/api/auth-repository";
import { useAuthStore } from "../../src/lib/api/auth-store";
import { setAuthToken } from "../../src/lib/api-config";

const ROUTES = {
  appHome: "/app"
} as const;

const COPY = {
  banner: "Modo desarrollo, no productivo.",
  credentialRequired: "La contraseña es obligatoria.",
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

const INITIAL_FORM_STATE: LoginFormState = { credential: "", username: "" };

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [usernameError, setUsernameError] = useState<string | undefined>(undefined);
  const [credentialError, setCredentialError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

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

    const envelope = await authRepository.login({
      username: form.username.trim(),
      password: form.credential
    });

    if (!envelope.ok || envelope.data === undefined) {
      setFormError(envelope.error?.message ?? envelope.error?.code ?? COPY.fallbackError);
      setIsPending(false);
      return;
    }

    const { token, user } = envelope.data;
    useAuthStore.getState().setToken(token, user);
    setAuthToken(token);
    router.push(ROUTES.appHome);
    setIsPending(false);
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
        <section
          aria-labelledby="login-title"
          className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm"
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
      </main>
    </div>
  );
}
