import { Router } from "express";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { requireRole } from "../edge/auth.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import { auditLogsQuerySchema } from "./dtos.js";

/**
 * Audit thin router (interface layer, gap-slice G2b, closes G2).
 *
 * Validate (strict zod) → call exactly one injected handler → render the
 * frozen envelope. No business rules, no data access, no infrastructure
 * imports: every dependency is a handler function supplied by the composition
 * root (fakes in tests; the application audit handler at cutover). The route,
 * envelope and status mirror the legacy `gestion/router.ts` audit-trail
 * block — zero observable change.
 *
 * NOT mounted yet: cutover mounts it under `/api/v1` and empties the legacy
 * block, so `/openapi.json` stays byte-identical in this slice.
 */

/** Handler input: same filter keys the legacy `auditLogsService.list` takes. */
export interface AuditListQuery {
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface AuditRouterDeps {
  listAudits(query: AuditListQuery): Promise<unknown>;
}

const ADMIN_ROLES = ["administrador", "administrador_principal", "admin", "superadmin"];

export function createAuditRouter(deps: AuditRouterDeps): Router {
  const router: Router = Router();
  const admin = requireRole(...ADMIN_ROLES);

  router.get(
    "/audit-logs",
    admin,
    validate(auditLogsQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(
        buildSuccessEnvelope(
          await deps.listAudits({
            action: req.query.action as string | undefined,
            actorUserId: req.query.actor as string | undefined,
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined,
            page: req.query.page as number | undefined,
            limit: req.query.limit as number | undefined
          })
        )
      );
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
