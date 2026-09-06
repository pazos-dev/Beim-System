import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AuthError, NotFoundError } from "../errors/taxonomy.js";

export interface Identity {
  userId: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      identity?: Identity;
    }
  }
}

/**
 * Role gate skeleton. Real session resolution (users/gestion_users bridge
 * tokens with hash + expiry) lands with the gestion/webshop modules; until
 * then, identity is only ever injected by upstream middleware/tests.
 *
 * Policy: NOT_FOUND_OR_FORBIDDEN. A caller without an identity sees 404,
 * never a hint that the resource exists. A caller with an identity whose
 * roles do not match sees 403 FORBIDDEN. Expired bridge tokens (-> 401) are
 * the auth module's responsibility in a later PR.
 */
export function requireRole(...allowedRoles: string[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const identity = req.identity;
    if (identity === undefined) {
      next(new NotFoundError());
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.some((role) => identity.roles.includes(role))) {
      next(new AuthError("FORBIDDEN"));
      return;
    }
    next();
  };
}