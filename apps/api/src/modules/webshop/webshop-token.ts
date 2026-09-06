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

export function requireWebshopToken(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers.authorization;
      const token =
        header !== undefined && header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : null;
      if (token === null || token.length === 0) {
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
 * Scope note: webshop sessions carry users.role (cliente/admin/superadmin),
 * so this resolver unblocks ADMIN-gated gestion routes for admin/superadmin
 * sessions. Operator roles (vendedor/tecnico/caja/…) stay fail-closed until
 * gestion_users session issuance exists.
 */
export function createBearerIdentityResolver(
  verify: (token: string) => Promise<SessionTokenClaims | null>
): (req: Request) => Promise<Identity | undefined> {
  return async (req: Request): Promise<Identity | undefined> => {
    const header = req.headers.authorization;
    const token =
      header !== undefined && header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : null;
    if (token === null || token.length === 0) return undefined;
    const claims = await verify(token);
    if (claims === null) return undefined;
    return { userId: claims.userId, roles: [claims.role] };
  };
}

/** Production resolver: Bearer webshop session → Identity. */
const bearerIdentityResolver = createBearerIdentityResolver((token) =>
  authService.verifySessionToken(token)
);

export function resolveBearerIdentity(req: Request): Promise<Identity | undefined> {
  return bearerIdentityResolver(req);
}