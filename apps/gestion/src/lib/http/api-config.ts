// Sole env reader for the HTTP API layer. No other module under
// `src/lib/http` (or hooks/adapters built on it) may read
// `NEXT_PUBLIC_BEIM_API_BASE_URL` / `BEIM_API_BASE_URL` directly, so the
// trailing-slash join bug can only ever be fixed in one place.

export const DEFAULT_API_BASE_URL = "http://localhost:4000/api/v1";

export interface ApiEnv {
  readonly NEXT_PUBLIC_BEIM_API_BASE_URL?: string;
  readonly BEIM_API_BASE_URL?: string;
}

function cleanBaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed === "" ? undefined : trimmed;
}

function readProcessEnv(): ApiEnv {
  const scope = globalThis as {
    readonly process?: { readonly env?: Record<string, string | undefined> };
  };
  return {
    BEIM_API_BASE_URL: scope.process?.env?.BEIM_API_BASE_URL,
    NEXT_PUBLIC_BEIM_API_BASE_URL: scope.process?.env?.NEXT_PUBLIC_BEIM_API_BASE_URL
  };
}

// Client (NEXT_PUBLIC_*) wins so browser bundles resolve without server env;
// server-only BEIM_* is the fallback; empty/blank values count as unset.
export function resolveApiBaseUrl(env?: ApiEnv): string {
  const injected = env ?? readProcessEnv();
  return (
    cleanBaseUrl(injected.NEXT_PUBLIC_BEIM_API_BASE_URL) ??
    cleanBaseUrl(injected.BEIM_API_BASE_URL) ??
    DEFAULT_API_BASE_URL
  );
}

// Joins the configured base (which already ends in `/api/v1`) with an
// endpoint path using exactly one separator, so callers can never produce a
// double `/api/v1/api/v1` prefix or a `//` seam.
export function joinApiPath(baseUrl: string, path: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  const trimmedPath = path.trim();
  const suffix = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  return `${base}${suffix}`;
}
