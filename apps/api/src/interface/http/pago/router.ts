import { Router } from "express";
import { rateLimit } from "../edge/rate-limit.js";
import { validate } from "../edge/validate.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { AuthError } from "../../../errors/taxonomy.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  pagoOrderIdParamSchema,
  pagoWebhookBodySchema,
  type PagoWebhookBody
} from "./dtos.js";

/**
 * Pago thin router (interface layer, Unidad 6).
 *
 * Validate (lax order ids, catchall webhook body) → call exactly one
 * injected handler → render the frozen envelope. No business rules, no data
 * access, no infrastructure imports: every dependency is a handler function
 * supplied by the composition root (fakes in tests; application payment
 * handlers at cutover). Routes, envelopes and statuses mirror the legacy
 * `webshop/router.ts` MercadoPago block — zero observable change.
 *
 * Auth notes: the preference route needs an owned session (`userId` comes
 * from the wiring-time session guard via `req.identity`; missing → uniform
 * 401, never a hint). The webhook is unauthenticated by design — MP signs
 * with `x-signature` instead of a session token, so a missing signature is
 * 403 (never 401: there is no session to challenge for).
 *
 * NOT mounted yet: cutover (PR8) mounts it under `/api/v1` and empties the
 * legacy block, so `/openapi.json` stays byte-identical in this slice.
 */

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface PagoRouterDeps {
  createPreference(input: { userId: string; orderId: string }): Promise<unknown>;
  handleWebhook(input: {
    notificationId: string;
    type: string;
    dataId: string;
    xSignature: string;
    xRequestId?: string;
  }): Promise<{ outcome: string; orderId?: string }>;
}

export function createPagoRouter(deps: PagoRouterDeps): Router {
  const router: Router = Router();
  // Same budgets as legacy: mutating preference writes share the 60/min
  // bucket; the IPN endpoint keeps its own 60/min bucket.
  const writeLimiter = rateLimit(60_000, 60);
  const webhookLimiter = rateLimit(60_000, 60);

  router.post(
    "/orders/:id/payment-preference",
    writeLimiter,
    validate(pagoOrderIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const userId = req.identity?.userId;
      if (userId === undefined) throw new AuthError("AUTHENTICATION_REQUIRED", "Autenticación requerida");
      const orderId = req.params.id as string;
      res.status(201).json(buildSuccessEnvelope(await deps.createPreference({ userId, orderId })));
    })
  );

  router.post(
    "/webhooks/mercadopago",
    webhookLimiter,
    validate(pagoWebhookBodySchema),
    asyncHandler(async (req, res) => {
      const rawSignature = req.headers["x-signature"];
      if (typeof rawSignature !== "string" || rawSignature.length === 0) {
        throw new AuthError("FORBIDDEN");
      }
      const rawRequestId = req.headers["x-request-id"];
      const body = req.body as PagoWebhookBody;
      const result = await deps.handleWebhook({
        notificationId: body.id,
        type: body.type,
        dataId: body.data.id,
        xSignature: rawSignature,
        xRequestId: typeof rawRequestId === "string" ? rawRequestId : undefined
      });
      res.json(
        buildSuccessEnvelope(
          result.orderId !== undefined ? { status: result.outcome, orderId: result.orderId } : { status: result.outcome }
        )
      );
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
