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
import { NotFoundError, UnsupportedMediaTypeError } from "../../errors/taxonomy.js";
import { asyncHandler } from "../../middleware/error-handler.js";
import { validate } from "../../middleware/validate.js";

import {
  checkoutSessionCreateSchema,
  gestionAccessSchema,
  loginSchema,
  orderCreateSchema,
  pageQuerySchema,
  paramUuidSchema,
  productListQuerySchema,
  registerSchema
} from "./schemas.js";
import { authService } from "./services/auth.js";
import { catalogService } from "./services/catalog.js";
import { checkoutService, ordersService } from "./services/orders.js";
import { uploadsService } from "./services/uploads.js";
import { requireWebshopToken } from "./webshop-token.js";

export const webshopRouter: Router = Router();

const token = requireWebshopToken();

/* ---------------------------------- auth ---------------------------------- */

webshopRouter.post(
  "/auth/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(buildSuccessEnvelope(result));
  })
);

webshopRouter.post(
  "/auth/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.register(req.body);
    res.status(201).json(buildSuccessEnvelope({ user }));
  })
);

webshopRouter.post(
  "/auth/gestion-access",
  validate(gestionAccessSchema),
  asyncHandler(async (req, res) => {
    const result = await authService.gestionAccess(req.body);
    res.json(buildSuccessEnvelope(result));
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

/* --------------------------------- uploads -------------------------------- */

webshopRouter.post(
  "/uploads/product-image",
  token,
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
    res.send(loaded.bytes);
  })
);