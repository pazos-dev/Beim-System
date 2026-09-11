import type { GestionError } from "../data/schemas";
import { resolveConsoleApiBaseUrl } from "../shared/api-console-session";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { tokenFromCookie } from "../shared/auth";
import { getApiBearer } from "../shared/session-store";

/**
 * User-safe Spanish message shown when the route slice is not yet wired to the
 * remote API. Every "next implementation" response begins with this prefix so
 * the UI can surface a single, visible ownership marker.
 */
export const NEXT_IMPLEMENTATION_MESSAGE =
  "Próxima implementación: se requiere una sesión de API activa para acceder a los datos remotos.";

export interface GestionApiContext {
  baseUrl: string;
  /** Server-only bearer token. Never serialize into a request body or response. */
  token: string;
}

/**
 * Resolves the remote API context for the current session cookie.
 *
 * The bearer is read from the server-only session store and is returned only
 * inside this server-side context object. Callers must keep it in headers and
 * never include it in JSON bodies or client payloads.
 */
export function resolveGestionApiContext(
  cookieValue: string | undefined
): Result<GestionApiContext, GestionError> {
  const sessionToken = cookieValue === undefined ? null : tokenFromCookie(cookieValue);
  if (sessionToken === null) {
    return err(
      createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, NEXT_IMPLEMENTATION_MESSAGE)
    );
  }
  const bearer = getApiBearer(sessionToken);
  if (bearer === undefined) {
    return err(
      createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, NEXT_IMPLEMENTATION_MESSAGE)
    );
  }
  return ok({ baseUrl: resolveConsoleApiBaseUrl(), token: bearer.token });
}
