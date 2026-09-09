import { Router, type Request, type Response } from "express";
import type {
  ConfirmSalesBatchInput,
  ConfirmSalesBatchResult
} from "../../../application/sales-batch/sales-batch.js";
import type {
  CreateOrderInput,
  MintCheckoutSessionInput,
  OrderResult
} from "../../../application/orders/orders.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { interfaceErrorHandler, renderError } from "../errorHandler.js";
import { validate } from "../edge/validate.js";
import {
  checkoutSessionBodySchema,
  orderCreateBodySchema,
  salesBatchBodySchema
} from "./dtos.js";

/**
 * Venta slice thin router (interface layer, Unidad 4).
 *
 * Validate-handler-envelope only: each route validates its strict DTO at
 * the edge (failures → 422 via `validate`), calls exactly one application
 * handler, and renders the frozen envelope (201 on success, taxonomy
 * status otherwise via `renderError`). No business rules, no role gates
 * (applied at wiring), no raw pg, adapters, mappers, or SDK clients —
 * handlers only. NOT mounted in the composition root yet (cutover PR8);
 * the legacy `gestion`/`webshop` routers still serve these paths, so the
 * observable contract (`/openapi.json`, matrix) is unchanged.
 */
export interface VentaRouterDeps {
  confirmBatch: (input: ConfirmSalesBatchInput) => Promise<ConfirmSalesBatchResult>;
  createOrder: (input: CreateOrderInput) => Promise<OrderResult>;
  mintCheckoutSession: (input: MintCheckoutSessionInput) => Promise<OrderResult>;
}

export function createVentaRouter(deps: VentaRouterDeps): Router {
  const router = Router();

  router.post(
    "/sales-batch",
    validate(salesBatchBodySchema),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const result = await deps.confirmBatch(req.body as ConfirmSalesBatchInput);
        res.status(201).json(buildSuccessEnvelope(result));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.post(
    "/orders",
    validate(orderCreateBodySchema),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const result = await deps.createOrder(req.body as CreateOrderInput);
        res.status(201).json(buildSuccessEnvelope(result));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.post(
    "/checkout-sessions",
    validate(checkoutSessionBodySchema),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const result = await deps.mintCheckoutSession(req.body as MintCheckoutSessionInput);
        res.status(201).json(buildSuccessEnvelope(result));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.use(interfaceErrorHandler);
  return router;
}
