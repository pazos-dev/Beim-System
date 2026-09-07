import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { buildSuccessEnvelope } from "./errors/envelope.js";
import { NotFoundError } from "./errors/taxonomy.js";
import { errorHandler } from "./middleware/error-handler.js";
import { cors } from "./middleware/cors.js";
import { securityHeaders } from "./middleware/security-headers.js";
import type { Identity } from "./middleware/auth.js";
import { gestionRouter } from "./modules/gestion/router.js";
import { webshopRouter } from "./modules/webshop/router.js";

export interface CreateAppOptions {
  /**
   * Upstream identity resolver. The production server wires the Bearer
   * session resolver (webshop-token.ts); tests inject canned identities.
   * May be async (DB-backed). When it returns undefined the request is
   * treated as anonymous and the NOT_FOUND_OR_FORBIDDEN policy applies
   * (404, never a hint). A resolver that throws fails loud (500) instead
   * of silently anonymizing the request.
   */
  resolveIdentity?: (req: Request) => Identity | undefined | Promise<Identity | undefined>;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  // Cap JSON bodies: auth/catalog payloads are small; oversized bodies are
  // rejected with 413 before reaching any handler.
  app.use(express.json({ limit: "256kb" }));
  // Baseline security headers on every response (before identity + routers).
  app.use(securityHeaders);
  // CORS allowlist before identity: preflights must not require identity
  // nor reach the routers (unlisted origins fall through to the catch-all).
  app.use(cors());

  // Identity injection runs before every route (and before /health) so the
  // role gates in the routers see req.identity when provided.
  app.use(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const identity = await options.resolveIdentity?.(req);
      if (identity !== undefined) {
        req.identity = identity;
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json(buildSuccessEnvelope({ status: "ok" }));
  });

  // Module routers mount here under a versioned prefix. Webshop mounts
  // FIRST: its public catalog/auth routes must not be shadowed, and the
  // modules own disjoint paths by design (PR 4; gestion since PR 3).
  app.use("/api/v1", webshopRouter);
  app.use("/api/v1", gestionRouter);

  // Catch-all: unmatched routes become a NOT_FOUND_OR_FORBIDDEN envelope
  // (must sit before the error middleware so `next(err)` reaches it).
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError());
  });

  app.use(errorHandler);
  return app;
}