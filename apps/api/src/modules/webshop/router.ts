/**
 * Webshop module router (PR 4) — webshop-api/spec.md.
 *
 * Mounted at /api/v1 BEFORE the gestion router (no path overlap by design:
 * webshop owns products/promo-slides/orders/checkout/uploads + the auth trio;
 * gestion keeps operator-gated categories/services/etc.).
 *
 * Public: auth (login/register/gestion-access), catalog reads, slides,
 * upload serving. Token-protected: orders, checkout sessions, upload writes.
 * Status codes: 201 for creates, 200 otherwise; errors flow to the central
 * errorHandler as envelopes (401 uniform for auth, 415/413 for uploads,
 * 404 for ownership-scoped reads).
 */
import { Router } from "express";
import { buildSuccessEnvelope } from "../../errors/envelope.js";
import { AuthError, NotFoundError, UnsupportedMediaTypeError } from "../../errors/taxonomy.js";
import { requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/error-handler.js";
import { validate } from "../../middleware/validate.js";

import {
  checkoutSessionCreateSchema,
  gestionAccessSchema,
  loginSchema,
  mpWebhookSchema,
  orderCreateSchema,
  pageQuerySchema,
  paramOrderIdSchema,
  paramUuidSchema,
  productListQuerySchema,
  registerSchema
} from "./schemas.js";
import { authService } from "./services/auth.js";
import { catalogService } from "./services/catalog.js";
import { checkoutService, ordersService } from "./services/orders.js";
import { paymentsService } from "./services/payments.js";
import { uploadsService } from "./services/uploads.js";
import { requireWebshopToken } from "./webshop-token.js";
import { rateLimit } from "../../middleware/rate-limit.js";

export const webshopRouter: Router = Router();

const token = requireWebshopToken();

// Brute-force surface: the auth trio gets a strict bucket (credential
// stuffing / bridge-token guessing), mutating endpoints a looser one.
// In-memory = single-instance scope (see rate-limit.ts).
const authLimiter = rateLimit(60_000, 10);
const writeLimiter = rateLimit(60_000, 60);
// MercadoPago IPN endpoint: unauthenticated by design (MP signs with
// x-signature instead of a session token), still rate-limited.
const webhookLimiter = rateLimit(60_000, 60);

/* ---------------------------------- auth ---------------------------------- */

webshopRouter.post(
  "/auth/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(buildSuccessEnvelope(result));
  })
);

webshopRouter.post(
  "/auth/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.register(req.body);
    res.status(201).json(buildSuccessEnvelope({ user }));
  })
);

webshopRouter.post(
  "/auth/gestion-access",
  authLimiter,
  validate(gestionAccessSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.gestionAccess(req.body);
    res.json(buildSuccessEnvelope(result));
  })
);

webshopRouter.post(
  "/auth/logout",
  token,
  asyncHandler(async (req, res) => {
    // The token guard proved the session exists, but it only attaches the
    // userId — re-parse the Bearer exactly like webshop-token.ts to hash and
    // delete this session. Always 200: deleting a missing row is a no-op, so
    // the response never reveals session state (idempotent, no oracle).
    const header = req.headers.authorization;
    const raw =
      header !== undefined && header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (raw.length > 0) {
      await authService.logout({ token: raw });
    }
    res.json(buildSuccessEnvelope({ loggedOut: true }));
  })
);

/* -------------------------------- catalog --------------------------------- */

webshopRouter.get(
  "/products",
  validate(productListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const page = await catalogService.listPublished(req.query);
    res.json(buildSuccessEnvelope(page));
  })
);

webshopRouter.get(
  "/products/:id",
  validate(paramUuidSchema, "params"),
  asyncHandler(async (req, res) => {
    const product = await catalogService.getPublishedById(req.params.id as string);
    if (product === null) throw new NotFoundError(`Producto no encontrado: ${req.params.id as string}`);
    res.json(buildSuccessEnvelope(product));
  })
);

webshopRouter.get(
  "/promo-slides",
  asyncHandler(async (_req, res) => {
    res.json(buildSuccessEnvelope(await catalogService.listSlides()));
  })
);

/* --------------------------------- orders --------------------------------- */

webshopRouter.post(
  "/orders",
  token,
  writeLimiter,
  validate(orderCreateSchema),
  asyncHandler(async (req, res) => {
    const order = await ordersService.create(req.identity!.userId, req.body);
    res.status(201).json(buildSuccessEnvelope(order));
  })
);

webshopRouter.get(
  "/orders",
  token,
  validate(pageQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const mine = await ordersService.listMine(req.identity!.userId, req.query);
    res.json(buildSuccessEnvelope(mine));
  })
);

webshopRouter.get(
  "/orders/:id",
  token,
  validate(paramUuidSchema, "params"),
  asyncHandler(async (req, res) => {
    const order = await ordersService.getMine(req.identity!.userId, req.params.id as string);
    if (order === null) throw new NotFoundError(`Orden no encontrada: ${req.params.id as string}`);
    res.json(buildSuccessEnvelope(order));
  })
);

/* ------------------------------- checkout --------------------------------- */

webshopRouter.post(
  "/checkout-sessions",
  token,
  writeLimiter,
  validate(checkoutSessionCreateSchema),
  asyncHandler(async (req, res) => {
    const session = await checkoutService.create(
      req.identity!.userId,
      req.body.orderId,
      req.body.paymentMethodId ?? null
    );
    res.status(201).json(buildSuccessEnvelope(session));
  })
);

/* --------------------------- mercadopago payments -------------------------- */

webshopRouter.post(
  "/orders/:id/payment-preference",
  token,
  writeLimiter,
  // Lax id validation on purpose (see paramOrderIdSchema): orders.id is TEXT
  // and legacy rows are not uuid-shaped; the service owns 404/409.
  validate(paramOrderIdSchema, "params"),
  asyncHandler(async (req, res) => {
    const preference = await paymentsService.createPreferenceForOrder(
      req.identity!.userId,
      req.params.id as string
    );
    res.status(201).json(buildSuccessEnvelope(preference));
  })
);

webshopRouter.post(
  "/webhooks/mercadopago",
  webhookLimiter,
  validate(mpWebhookSchema),
  asyncHandler(async (req, res) => {
    // x-signature is the only authentication this endpoint has: missing
    // means unauthenticated, hence 403 (never 401 — there is no session to
    // challenge for). x-request-id is optional (part of the signed manifest
    // when present).
    const rawSignature = req.headers["x-signature"];
    if (typeof rawSignature !== "string" || rawSignature.length === 0) {
      throw new AuthError("FORBIDDEN");
    }
    const rawRequestId = req.headers["x-request-id"];
    const body = req.body as { id: string; type: string; data: { id: string } };
    const result = await paymentsService.handlePaymentNotification({
      notificationId: body.id,
      type: body.type,
      dataId: body.data.id,
      xSignature: rawSignature,
      xRequestId: typeof rawRequestId === "string" ? rawRequestId : undefined
    });
    res.json(
      buildSuccessEnvelope(
        result.orderId !== undefined
          ? { status: result.outcome, orderId: result.orderId }
          : { status: result.outcome }
      )
    );
  })
);

/* --------------------------------- uploads -------------------------------- */

webshopRouter.post(
  "/uploads/product-image",
  token,
  // Image uploads land in the public catalog: admin-only (cliente sessions
  // get 403, never a hint beyond the role gate).
  requireRole("administrador", "administrador_principal", "admin", "superadmin"),
  writeLimiter,
  asyncHandler(async (req, res) => {
    const contentType = req.headers["content-type"];
    if (contentType === undefined) throw new UnsupportedMediaTypeError();
    const uploaded = await uploadsService.storeImage(req, contentType);
    res.status(201).json(buildSuccessEnvelope({ url: uploaded.url }));
  })
);

webshopRouter.get(
  "/uploads/:filename",
  asyncHandler(async (req, res) => {
    const loaded = await uploadsService.load(req.params.filename as string);
    if (loaded === null) throw new NotFoundError();
    res.setHeader("Content-Type", loaded.contentType);
    // Served bytes are attacker-influenced uploads: force nosniff even though
    // the global security-headers middleware already sets it (defense in depth).
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(loaded.bytes);
  })
);