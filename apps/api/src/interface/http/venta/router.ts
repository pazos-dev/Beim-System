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
import type { Uuid } from "../../../domain/shared/ports.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { interfaceErrorHandler, renderError } from "../errorHandler.js";
import { validate } from "../edge/validate.js";
import {
  checkoutSessionBodySchema,
  type CheckoutSessionBody,
  orderCreateBodySchema,
  type OrderCreateBody,
  salesBatchBodySchema
} from "./dtos.js";

/**
 * Venta slice thin router (interface layer, Unidad 4 + F4b-A order inputs).
 *
 * Validate-handler-envelope only: each route validates its strict DTO at
 * the edge (failures → 422 via `validate`), calls exactly one application
 * handler, and renders the frozen envelope (201 on success, taxonomy
 * status otherwise via `renderError`). No business rules, no role gates
 * (applied at wiring), no raw pg, adapters, mappers, or SDK clients —
 * handlers only. NOT mounted in the composition root yet (cutover PR8);
 * the legacy `gestion`/`webshop` routers still serve these paths, so the
 * observable contract (`/openapi.json`, matrix) is unchanged.
 *
 * F4b-A: order/checkout bodies are legacy-exact. `orderId` is edge-owned
 * (generated via `uuid` when the client omits it — legacy clients never
 * send one); `userId` comes from the upstream identity (wiring injects it
 * — fail-closed 404 here, same policy as `requireRole`). The checkout
 * route shapes the legacy `{id, url, status, orderId, expiresAt}` envelope;
 * the handler returns data, this router owns the shape.
 */
export interface VentaRouterDeps {
  confirmBatch: (input: ConfirmSalesBatchInput) => Promise<ConfirmSalesBatchResult>;
  createOrder: (input: CreateOrderInput) => Promise<OrderResult>;
  mintCheckoutSession: (input: MintCheckoutSessionInput) => Promise<OrderResult>;
  /** Edge id generation for client-less `orderId` (never a hardcoded uuid). */
  uuid: Uuid;
  /** Base URL for the legacy checkout envelope (injected, never imported). */
  checkoutBaseUrl: string;
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
        const userId = req.identity?.userId;
        if (userId === undefined) throw new NotFoundError();
        const body = req.body as OrderCreateBody;
        const result = await deps.createOrder({
          orderId: body.orderId ?? deps.uuid.generate(),
          customer: body.customer,
          email: body.email ?? null,
          phone: body.phone ?? null,
          ci: body.ci ?? null,
          rut: body.rut ?? null,
          address: body.address ?? null,
          shipping: body.shipping ?? null,
          comments: body.comments ?? null,
          items: body.items,
          userId
        });
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
        const body = req.body as CheckoutSessionBody;
        const result = await deps.mintCheckoutSession({
          orderId: body.orderId,
          paymentMethodId: body.paymentMethodId ?? null,
          ...(req.identity?.userId !== undefined ? { userId: req.identity.userId } : {})
        });
        const session = result.venta.checkoutSession;
        if (session === null) throw new Error("checkout session missing after mint");
        res.status(201).json(
          buildSuccessEnvelope({
            id: session.id,
            url: `${deps.checkoutBaseUrl}/checkout/${session.id}`,
            status: session.status,
            orderId: result.venta.id,
            expiresAt: session.expiresAt
          })
        );
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.use(interfaceErrorHandler);
  return router;
}
