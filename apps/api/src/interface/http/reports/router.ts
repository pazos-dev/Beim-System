import { Router } from "express";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { requireRole } from "../edge/auth.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  reportsRangeQuerySchema,
  reportsTopQuerySchema,
  type ReportsRangeQuery,
  type ReportsTopQuery
} from "./dtos.js";

/**
 * Reports thin router (interface layer, gap-slice G2).
 *
 * Validate (strict zod) → call exactly one injected handler → render the
 * frozen envelope. No business rules, no data access, no infrastructure
 * imports: every dependency is a handler function supplied by the composition
 * root (fakes in tests; application report handlers at cutover). Routes,
 * envelopes and statuses mirror the legacy `gestion/router.ts` reports
 * block — zero observable change.
 *
 * NOT mounted yet: cutover mounts it under `/api/v1` and empties the legacy
 * block, so `/openapi.json` stays byte-identical in this slice.
 */

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface ReportsRouterDeps {
  salesSummary(range: ReportsRangeQuery): Promise<unknown>;
  stockValuation(): Promise<unknown>;
  cashSummary(range: ReportsRangeQuery): Promise<unknown>;
  topProducts(query: ReportsTopQuery): Promise<unknown>;
  repairsByStatus(): Promise<unknown>;
}

const OPERATOR_ROLES = [
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal",
  "admin",
  "superadmin"
];

export function createReportsRouter(deps: ReportsRouterDeps): Router {
  const router: Router = Router();
  const operator = requireRole(...OPERATOR_ROLES);

  router.get(
    "/reports/sales-summary",
    operator,
    validate(reportsRangeQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.salesSummary(req.query as ReportsRangeQuery)));
    })
  );

  router.get(
    "/reports/stock-valuation",
    operator,
    asyncHandler(async (_req, res) => {
      res.json(buildSuccessEnvelope(await deps.stockValuation()));
    })
  );

  router.get(
    "/reports/cash-summary",
    operator,
    validate(reportsRangeQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.cashSummary(req.query as ReportsRangeQuery)));
    })
  );

  router.get(
    "/reports/top-products",
    operator,
    validate(reportsTopQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.topProducts(req.query as unknown as ReportsTopQuery)));
    })
  );

  router.get(
    "/reports/repairs-by-status",
    operator,
    asyncHandler(async (_req, res) => {
      res.json(buildSuccessEnvelope(await deps.repairsByStatus()));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
