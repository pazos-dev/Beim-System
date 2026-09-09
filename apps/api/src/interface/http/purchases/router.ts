import { Router, type RequestHandler } from "express";
import type { Identity } from "../edge/auth.js";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  purchaseCreateBodySchema,
  purchaseIdParamSchema,
  purchaseUpdateBodySchema,
  purchasesListQuerySchema,
  type PurchaseCreateBody,
  type PurchaseUpdateBody,
  type PurchasesListQuery
} from "./dtos.js";

/**
 * Purchase thin router (interface layer, G1b purchases slice, closes G1).
 *
 * Legacy-equivalent mirror of `GET /purchases` (operator `active` query),
 * `GET /purchases/:id` (operator uuid, 404), `POST /purchases` (admin, 201,
 * audit actor) and `PUT /purchases/:id` (admin uuid, id plus patch):
 * validate at the edge (strict zod, 422) -> exactly one injected handler
 * -> frozen success envelope (200/201, 404 with the legacy
 * `Compra no encontrada: <id>` message on unknown ids). `POST` forwards
 * the `toAuditActor` journal actor like legacy; `PUT` forwards id plus
 * patch only, exactly like legacy (no actor). No business rules, no role
 * gates (applied at wiring), no pg, no adapters, no mappers: the router
 * only translates transport shapes into handler inputs. Unmounted until
 * cutover, so the OpenAPI snapshot stays byte-identical.
 */

/** Audit journal actor — same shape the legacy `toAuditActor` builds. */
export interface PurchaseAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
}

export interface PurchaseRouterHandlers {
  list(filter: PurchasesListQuery): Promise<unknown>;
  getById(id: string): Promise<unknown | null>;
  create(input: PurchaseCreateBody, actor: PurchaseAuditActor): Promise<unknown>;
  update(id: string, patch: PurchaseUpdateBody): Promise<unknown>;
}

const asyncHandler =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };

function purchaseId(req: Parameters<RequestHandler>[0]): string {
  return req.params.id as string;
}

function toAuditActor(identity: Identity | undefined): PurchaseAuditActor {
  return { actorUserId: identity?.userId ?? null, actorRole: identity?.roles[0] ?? null };
}

export function makePurchaseRouter(handlers: PurchaseRouterHandlers): Router {
  const router = Router();

  router.get(
    "/",
    validate(purchasesListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await handlers.list(req.query as unknown as PurchasesListQuery)));
    })
  );

  router.get(
    "/:id",
    validate(purchaseIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = purchaseId(req);
      const purchase = await handlers.getById(id);
      if (purchase === null) throw new NotFoundError(`Compra no encontrada: ${id}`);
      res.json(buildSuccessEnvelope(purchase));
    })
  );

  router.post(
    "/",
    validate(purchaseCreateBodySchema),
    asyncHandler(async (req, res) => {
      const created = await handlers.create(req.body as PurchaseCreateBody, toAuditActor(req.identity));
      res.status(201).json(buildSuccessEnvelope(created));
    })
  );

  router.put(
    "/:id",
    validate(purchaseIdParamSchema, "params"),
    validate(purchaseUpdateBodySchema),
    asyncHandler(async (req, res) => {
      const updated = await handlers.update(purchaseId(req), req.body as PurchaseUpdateBody);
      res.json(buildSuccessEnvelope(updated));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
