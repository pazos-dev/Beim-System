import { z } from "zod";

import { createGestionError, ERROR_CODES } from "./errors";
import { err, ok, type Result } from "./result";
import type { GestionError } from "../data/schemas";

export const CONSOLE_LOGIN_PATH = "/api/v1/auth/gestion-login";
export const CONSOLE_LOGOUT_PATH = "/api/v1/auth/logout";
export const DEFAULT_CONSOLE_BASE_URL = "http://localhost:4000";

// Injectable fetch so tests never touch the network (DIP: depend on the
// abstraction, default to the platform implementation).
export type ConsoleFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ConsoleSessionBearer {
  token: string;
  expiresAtMs: number;
}

export interface ExchangeConsoleLoginInput {
  baseUrl: string;
  username: string;
  password: string;
  fetchImpl?: ConsoleFetch;
}

export interface RevokeConsoleSessionInput {
  baseUrl: string;
  token: string;
  fetchImpl?: ConsoleFetch;
}

// Reads the console base URL from the environment with a local default.
// Keeps env access in one place so routes and tests share it.
export function resolveConsoleApiBaseUrl(): string {
  const raw = process.env.BEIM_API_BASE_URL?.trim();
  return raw === undefined || raw === "" ? DEFAULT_CONSOLE_BASE_URL : raw;
}

function joinPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function resolveFetch(fetchImpl?: ConsoleFetch): ConsoleFetch {
  if (fetchImpl !== undefined) return fetchImpl;
  return (url, init) => globalThis.fetch(url, init);
}

const consoleLoginResponseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    token: z.string().min(1),
    expiresAt: z.union([z.string().min(1), z.number()]),
    user: z.unknown().optional()
  })
});

function toExpiresAtMs(expiresAt: string | number): number | null {
  const parsed = typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function dependencyUnavailable(reason: string): GestionError {
  return createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, { reason });
}

// Single responsibility: exchange gestion credentials for a console bearer.
// Never logs or returns credentials or tokens; failures carry only safe codes.
export async function exchangeConsoleLogin(
  input: ExchangeConsoleLoginInput
): Promise<Result<ConsoleSessionBearer, GestionError>> {
  const fetchImpl = resolveFetch(input.fetchImpl);
  let response: Response;
  try {
    response = await fetchImpl(joinPath(input.baseUrl, CONSOLE_LOGIN_PATH), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: input.username, password: input.password })
    });
  } catch {
    return err(dependencyUnavailable("Console auth is unreachable."));
  }

  if (response.status === 401) {
    return err(createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED));
  }
  if (response.status === 422) {
    return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
  }
  if (response.status === 429) {
    return err(dependencyUnavailable("Console login rate limit exceeded."));
  }
  if (response.status !== 200) {
    return err(dependencyUnavailable("Console login failed."));
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    return err(dependencyUnavailable("Console login returned an unreadable payload."));
  }
  const parsed = consoleLoginResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return err(dependencyUnavailable("Console login returned an unexpected payload."));
  }
  const expiresAtMs = toExpiresAtMs(parsed.data.data.expiresAt);
  if (expiresAtMs === null) {
    return err(dependencyUnavailable("Console login returned an invalid expiry."));
  }
  return ok({ token: parsed.data.data.token, expiresAtMs });
}

// Best-effort revoke: any outcome (failure, rate limit, network down) still
// resolves ok and never throws, so local logout can never fail because of it.
export async function revokeConsoleSession(
  input: RevokeConsoleSessionInput
): Promise<Result<undefined, never>> {
  try {
    const fetchImpl = resolveFetch(input.fetchImpl);
    await fetchImpl(joinPath(input.baseUrl, CONSOLE_LOGOUT_PATH), {
      method: "POST",
      headers: { Authorization: `Bearer ${input.token}` }
    });
  } catch {
    // Intentionally silent: revoke is fire-and-forget by design.
  }
  return ok(undefined);
}
