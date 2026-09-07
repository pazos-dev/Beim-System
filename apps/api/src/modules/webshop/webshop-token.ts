/**
 * Webshop bearer-token middleware (PR 4).
 *
 * Reads `Authorization: Bearer <token>` and resolves it via the auth service
 * (opaque token → sha256 → webshop_sessions join). Any failure — missing
 * header, malformed scheme, unknown, or expired session — is a uniform 401
 * (AUTHENTICATION_REQUIRED): we never hint whether a session or user exists.
 * On success it attaches the identity (userId + role) for the route handler.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AuthError } from "../../errors/taxonomy.js";
import type { Identity } from "../../middleware/auth.js";
import type { SessionTokenClaims } from "./ports.js";
import { authService } from "./services/auth.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Extracts the Bearer token from an Authorization header.
 *
 * Case-sensitive `Bearer ` prefix; the remainder is trimmed and an empty
 * remainder maps to null (same as a missing or malformed header).
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length === 0 ? null : token;
}

export function requireWebshopToken(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (token === null) {
        next(new AuthError("AUTHENTICATION_REQUIRED"));
        return;
      }
      const claims = await authService.verifySessionToken(token);
      if (claims === null) {
        next(new AuthError("AUTHENTICATION_REQUIRED"));
        return;
      }
      req.identity = { userId: claims.userId, roles: [claims.role] };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Server-runtime identity resolver (the `resolveIdentity` option of
 * createApp): `Authorization: Bearer <token>` → Identity, or undefined when
 * there is no usable identity (missing header, malformed scheme, empty,
 * unknown or expired session). Never throws for those cases — the gestion
 * NOT_FOUND_OR_FORBIDDEN policy turns "no identity" into 404. Unexpected
 * errors (e.g. DB outage) propagate so the request fails loud (500) instead
 * of silently anonymizing.
 *
 * Two realms, one header (issue #153):
 * - Webshop realm: opaque tokens over `webshop_sessions JOIN users`
 *   (roles cliente/admin/superadmin) — checked first.
 * - Console realm: opaque tokens over `gestion_sessions JOIN gestion_users`
 *   (operator roles vendedor/tecnico/caja/administrador/…) — fallback when
 *   the webshop lookup finds nothing. A deactivated console user resolves to
 *   null (fail-closed), same as an expired session.
 *
 * NOTE: the `token` route guard above (`requireWebshopToken`) intentionally
 * resolves webshop sessions ONLY — console sessions never pass it (webshop
 * orders/checkout/uploads stay webshop-only). Console tokens authorize
 * `requireRole` gestion routes through this resolver instead.
 */
export function createBearerIdentityResolver(
  verify: (token: string) => Promise<SessionTokenClaims | null>
): (req: Request) => Promise<Identity | undefined> {
  return async (req: Request): Promise<Identity | undefined> => {
    const token = extractBearerToken(req.headers.authorization);
    if (token === null) return undefined;
    const claims = await verify(token);
    if (claims === null) return undefined;
    return { userId: claims.userId, roles: [claims.role] };
  };
}

/** Production resolver: Bearer webshop session, else console session → Identity. */
const bearerIdentityResolver = createBearerIdentityResolver(
  async (token) =>
    (await authService.verifySessionToken(token)) ?? (await authService.verifyGestionSessionToken(token))
);

export function resolveBearerIdentity(req: Request): Promise<Identity | undefined> {
  return bearerIdentityResolver(req);
}

/**
 * Either-realm session gate (currently only used by POST /auth/logout):
 * accepts a valid webshop OR gestion session, attaching `{ userId, roles }`.
 * Anything else (missing/malformed/unknown/expired) is a uniform 401.
 * Any authenticated caller can only ever revoke their OWN presented token
 * downstream, so cross-realm acceptance here grants no extra capability.
 */
export function requireAnySessionToken(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req.headers.authorization);
      if (token === null) {
        next(new AuthError("AUTHENTICATION_REQUIRED"));
        return;
      }
      const claims = await authService.verifySessionToken(token);
      if (claims !== null) {
        req.identity = { userId: claims.userId, roles: [claims.role] };
        next();
        return;
      }
      const gestion = await authService.verifyGestionSessionToken(token);
      if (gestion !== null) {
        req.identity = { userId: gestion.userId, roles: [gestion.role] };
        next();
        return;
      }
      next(new AuthError("AUTHENTICATION_REQUIRED"));
    } catch (err) {
      next(err);
    }
  };
}