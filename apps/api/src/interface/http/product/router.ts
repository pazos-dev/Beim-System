import { Router, type RequestHandler } from "express";
import type {
  ConsumeWorkshopInput,
  RestoreLotsInput,
  SellProductInput
} from "../../../application/catalog/product-handlers.js";
import type { CreateProductInput } from "../../../domain/product/product.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  productConsumeBodySchema,
  productCreateBodySchema,
  productIdParamSchema,
  productRestoreBodySchema,
  productSellBodySchema,
  type ProductCreateBody
} from "./dtos.js";

/**
 * Product thin router (interface layer, Unidad 3 catalog slice).
 *
 * Validate at the edge (strict zod, 422) -> exactly one catalog handler ->
 * frozen success envelope. No business rules, no pg, no adapters, no
 * mappers: the router only translates transport shapes into handler inputs.
 * Unmounted until cutover (PR8), so the OpenAPI snapshot stays byte-identical.
 */
export interface ProductRouterHandlers {
  create(input: CreateProductInput): Promise<unknown>;
  sell(input: SellProductInput): Promise<unknown>;
  consumeWorkshop(input: ConsumeWorkshopInput): Promise<unknown>;
  restore(input: RestoreLotsInput): Promise<unknown>;
}

const asyncHandler =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };

export function makeProductRouter(handlers: ProductRouterHandlers): Router {
  const router = Router();

  router.post(
    "/",
    validate(productCreateBodySchema),
    asyncHandler(async (req, res) => {
      const created = await handlers.create(req.body as ProductCreateBody as CreateProductInput);
      res.status(201).json(buildSuccessEnvelope(created));
    })
  );

  router.post(
    "/:id/sell",
    validate(productIdParamSchema, "params"),
    validate(productSellBodySchema),
    asyncHandler(async (req, res) => {
      const sold = await handlers.sell({ productId: req.params.id as string, qty: req.body.qty as number });
      res.json(buildSuccessEnvelope(sold));
    })
  );

  router.post(
    "/:id/consume",
    validate(productIdParamSchema, "params"),
    validate(productConsumeBodySchema),
    asyncHandler(async (req, res) => {
      const consumed = await handlers.consumeWorkshop({
        productId: req.params.id as string,
        qty: req.body.qty as number
      });
      res.json(buildSuccessEnvelope(consumed));
    })
  );

  router.post(
    "/:id/restore",
    validate(productIdParamSchema, "params"),
    validate(productRestoreBodySchema),
    asyncHandler(async (req, res) => {
      const restored = await handlers.restore({
        productId: req.params.id as string,
        allocations: req.body.allocations as RestoreLotsInput["allocations"]
      });
      res.json(buildSuccessEnvelope(restored));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
