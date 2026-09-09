import { Router } from "express";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { requireRole, type Identity } from "../edge/auth.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  financialStateBodySchema,
  invoiceSettingsBodySchema,
  stockMovementBodySchema,
  stockMovementsQuerySchema,
  type FinancialStateBody,
  type InvoiceSettingsBody,
  type StockMovementBody,
  type StockMovementsQuery
} from "./dtos.js";

/**
 * Finance thin router (interface layer, gap-slice G3: financial-state +
 * invoice-settings + stock-movements, 6 routes).
 *
 * Validate (strict zod) → exactly one injected handler → frozen envelope.
 * No rules, no data access, no infrastructure imports. Role gates mirror the
 * legacy `gestion/router.ts` blocks: operator on 5 routes, principal-only
 * (`administrador_principal`, so `administrador` → 403) on PUT
 * /invoice-settings — the only principalOnly route in the system. POST
 * /stock-movements answers 201 and forwards the `toAuditActor` journal actor
 * like legacy; unknown products surface the handler's 404
 * (`Producto no encontrado: <id>`). NOT mounted yet: cutover mounts it and
 * empties the legacy blocks, so `/openapi.json` stays byte-identical.
 */

/** Audit journal actor — same shape the legacy `toAuditActor` builds. */
export interface FinanceAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
}

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface FinanceRouterDeps {
  getFinancialState(): Promise<unknown>;
  upsertFinancialState(patch: FinancialStateBody): Promise<unknown>;
  getInvoiceSettings(): Promise<unknown>;
  saveInvoiceSettings(doc: InvoiceSettingsBody): Promise<unknown>;
  listStockMovements(filter: StockMovementsQuery): Promise<unknown>;
  recordStockMovement(input: StockMovementBody, actor: FinanceAuditActor): Promise<unknown>;
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

function toAuditActor(identity: Identity | undefined): FinanceAuditActor {
  return { actorUserId: identity?.userId ?? null, actorRole: identity?.roles[0] ?? null };
}

export function createFinanceRouter(deps: FinanceRouterDeps): Router {
  const router: Router = Router();
  const operator = requireRole(...OPERATOR_ROLES);
  const principalOnly = requireRole("administrador_principal");

  router.get(
    "/financial-state",
    operator,
    asyncHandler(async (_req, res) => {
      res.json(buildSuccessEnvelope(await deps.getFinancialState()));
    })
  );

  router.put(
    "/financial-state",
    operator,
    validate(financialStateBodySchema),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.upsertFinancialState(req.body as FinancialStateBody)));
    })
  );

  router.get(
    "/invoice-settings",
    operator,
    asyncHandler(async (_req, res) => {
      res.json(buildSuccessEnvelope(await deps.getInvoiceSettings()));
    })
  );

  router.put(
    "/invoice-settings",
    principalOnly,
    validate(invoiceSettingsBodySchema),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.saveInvoiceSettings(req.body as InvoiceSettingsBody)));
    })
  );

  router.get(
    "/stock-movements",
    operator,
    validate(stockMovementsQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(
        buildSuccessEnvelope(
          await deps.listStockMovements({
            productId: req.query.productId as string | undefined,
            from: req.query.from as string | undefined,
            to: req.query.to as string | undefined
          })
        )
      );
    })
  );

  router.post(
    "/stock-movements",
    operator,
    validate(stockMovementBodySchema),
    asyncHandler(async (req, res) => {
      const recorded = await deps.recordStockMovement(
        req.body as StockMovementBody,
        toAuditActor(req.identity)
      );
      res.status(201).json(buildSuccessEnvelope(recorded));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
