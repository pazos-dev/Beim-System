// Sole HTTP exit for the Bearer API layer. Every backend request flows
// through `apiFetch`: it resolves the base URL via `api-config`, injects the
// in-memory Bearer token via `useSessionStore.getState()` (no subscription),
// and maps 401 to session death (clear + redirect to login). It never logs
// headers or tokens; error messages carry status/code only.

import { joinApiPath, resolveApiBaseUrl } from "./api-config";
import { useSessionStore } from "../../store/session.slice";

export const API_ERROR_KIND = {
  NETWORK: "network",
  PARSE: "parse",
  SERVER: "server"
} as const;

export type ApiErrorKind = (typeof API_ERROR_KIND)[keyof typeof API_ERROR_KIND];

export interface ApiErrorExtra {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(kind: ApiErrorKind, message: string, extra?: ApiErrorExtra) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = extra?.status;
    this.code = extra?.code;
    this.details = extra?.details;
  }
}

export const SESSION_LOGIN_PATH = "/login";

export interface ApiFetchOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  readonly tokenOverride?: string | null;
  readonly onUnauthorized?: () => void;
  readonly redirectTo?: (path: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSuccessEnvelope(payload: unknown): payload is { readonly data: unknown } {
  return isRecord(payload) && payload.ok === true && "data" in payload;
}

interface ErrorEnvelope {
  readonly code?: string;
  readonly message?: string;
  readonly details?: unknown;
}

function readErrorEnvelope(payload: unknown): ErrorEnvelope {
  if (!isRecord(payload) || !isRecord(payload.error)) return {};
  const { code, details, message } = payload.error;
  return {
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof message === "string" ? { message } : {}),
    ...(details === undefined ? {} : { details })
  };
}

function defaultRedirect(path: string): void {
  if (typeof window !== "undefined" && typeof window.location?.assign === "function") {
    window.location.assign(path);
  }
}

// Best-effort navigation seam: unit-testable without touching jsdom's
// non-configurable `window.location`.
export function redirectToLogin(redirectTo?: (path: string) => void): void {
  try {
    (redirectTo ?? defaultRedirect)(SESSION_LOGIN_PATH);
  } catch {
    // Navigation already best-effort; the session is cleared regardless.
  }
}

// 401 session death: clear actor+token so no stale identity renders, then
// route to login. Query invalidation (`['bootstrap']`) stays with the
// calling hook via `onUnauthorized`; this module owns state + navigation.
export function handleSessionDeath(redirectTo?: (path: string) => void): void {
  useSessionStore.getState().clearSession();
  redirectToLogin(redirectTo);
}

export async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const url = joinApiPath(resolveApiBaseUrl(), path);
  const token =
    options?.tokenOverride !== undefined
      ? options.tokenOverride
      : useSessionStore.getState().token;

  const headers: Record<string, string> = { ...(options?.headers ?? {}) };
  if (options?.body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["authorization"] = `Bearer ${token}`;

  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const init: RequestInit = {
    ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    headers,
    method: options?.method ?? (options?.body !== undefined ? "POST" : "GET")
  };

  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new ApiError(API_ERROR_KIND.NETWORK, `The network request to ${path} failed.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(API_ERROR_KIND.PARSE, `The response from ${path} is not valid JSON.`, {
      status: response.status
    });
  }

  if (response.status === 401) {
    const envelope = readErrorEnvelope(payload);
    handleSessionDeath(options?.redirectTo);
    options?.onUnauthorized?.();
    throw new ApiError(API_ERROR_KIND.SERVER, envelope.message ?? "The session is not available.", {
      code: envelope.code ?? "auth-required",
      ...(envelope.details === undefined ? {} : { details: envelope.details }),
      status: 401
    });
  }

  if (response.ok && isSuccessEnvelope(payload)) return payload.data as T;

  const envelope = readErrorEnvelope(payload);
  throw new ApiError(
    response.ok ? API_ERROR_KIND.PARSE : API_ERROR_KIND.SERVER,
    envelope.message ?? `The request to ${path} failed.`,
    {
      ...(envelope.code === undefined ? {} : { code: envelope.code }),
      ...(envelope.details === undefined ? {} : { details: envelope.details }),
      status: response.status
    }
  );
}
