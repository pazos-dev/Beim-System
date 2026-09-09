import { Router } from "express";
import type { Identity } from "../edge/auth.js";
import { requireRole } from "../edge/auth.js";
import { validate } from "../edge/validate.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  cashSessionCloseBodySchema,
  cashSessionIdParamSchema,
  cashSessionMovementBodySchema,
  cashSessionOpenBodySchema,
  type CashSessionMovementBody,
  type CashSessionOpenBody
} from "./dtos.js";

/**
 * Caja thin router (interface layer, Unidad 6).
 *
 * Validate (strict zod) → call exactly one injected handler → render the
 * frozen envelope. No business rules, no data access, no infrastructure
 * imports: every dependency is a handler function supplied by the composition
 * root (fakes in tests; application cash handlers at cutover). Routes,
 * envelopes and statuses mirror the legacy `gestion/router.ts` cash-sessions
 * block — zero observable change.
 *
 * NOT mounted yet: cutover (PR8) mounts it under `/api/v1` and empties the
 * legacy block, so `/openapi.json` stays byte-identical in this slice.
 */

/** Audit journal actor — same shape the legacy `toAuditActor` builds. */
export interface CajaAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
}

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface CajaRouterDeps {
  current(): Promise<unknown | null>;
  list(): Promise<unknown>;
  open(input: CashSessionOpenBody): Promise<unknown>;
  close(id: string, countedAmount: number): Promise<unknown>;
  recordMovement(id: string, input: CashSessionMovementBody, actor: CajaAuditActor): Promise<unknown>;
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

function toAuditActor(identity: Identity | undefined): CajaAuditActor {
  return { actorUserId: identity?.userId ?? null, actorRole: identity?.roles[0] ?? null };
}

export function createCajaRouter(deps: CajaRouterDeps): Router {
  const router: Router = Router();
  const operator = requireRole(...OPERATOR_ROLES);

  router.get(
    "/cash-sessions/current",
    operator,
    asyncHandler(async (req, res) => {
      const session = await deps.current();
      if (session === null) throw new NotFoundError("No hay ninguna sesión de caja abierta");
      res.json(buildSuccessEnvelope(session));
    })
  );

  router.get(
    "/cash-sessions",
    operator,
    asyncHandler(async (_req, res) => {
      res.json(buildSuccessEnvelope(await deps.list()));
    })
  );

  router.post(
    "/cash-sessions",
    operator,
    validate(cashSessionOpenBodySchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(buildSuccessEnvelope(await deps.open(req.body)));
    })
  );

  router.post(
    "/cash-sessions/:id/close",
    operator,
    validate(cashSessionIdParamSchema, "params"),
    validate(cashSessionCloseBodySchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      res.json(buildSuccessEnvelope(await deps.close(id, req.body.countedAmount as number)));
    })
  );

  router.post(
    "/cash-sessions/:id/movements",
    operator,
    validate(cashSessionIdParamSchema, "params"),
    validate(cashSessionMovementBodySchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const movement = await deps.recordMovement(id, req.body, toAuditActor(req.identity));
      res.status(201).json(buildSuccessEnvelope(movement));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
