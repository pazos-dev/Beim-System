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