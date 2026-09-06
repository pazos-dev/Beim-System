import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { buildSuccessEnvelope } from "./errors/envelope.js";
import { NotFoundError } from "./errors/taxonomy.js";
import { errorHandler } from "./middleware/error-handler.js";
import type { Identity } from "./middleware/auth.js";
import { gestionRouter } from "./modules/gestion/router.js";
import { webshopRouter } from "./modules/webshop/router.js";

export interface CreateAppOptions {
  /**
   * Upstream identity resolver (real session resolution lands with the auth
   * module in a later PR). Tests and future auth middleware inject identity
   * here; when it returns undefined the request is treated as anonymous and
   * the NOT_FOUND_OR_FORBIDDEN policy applies (404, never a hint).
   */
  resolveIdentity?: (req: Request) => Identity | undefined;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  // Identity injection runs before every route (and before /health) so the
  // role gates in the routers see req.identity when provided.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const identity = options.resolveIdentity?.(req);
    if (identity !== undefined) {
      req.identity = identity;
    }
    next();
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