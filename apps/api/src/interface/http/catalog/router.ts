import { Router } from "express";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import { catalogIdParamSchema, catalogListQuerySchema, type CatalogListQuery } from "./dtos.js";

/**
 * Catalog thin router (interface layer, gap-slice G4).
 *
 * Validate (strict zod) → call exactly one injected handler → render the
 * frozen envelope. No business rules, no data access, no infrastructure
 * imports: every dependency is a handler function supplied by the composition
 * root (fakes in tests; the application catalog-reads handlers at cutover).
 * Routes, envelopes and statuses mirror the legacy `webshop/router.ts`
 * catalog block (`GET /products` public paginated, `GET /products/:id`
 * public uuid with the legacy `Producto no encontrado: <id>` 404,
 * `GET /promo-slides` public) — zero observable change.
 *
 * NOT mounted yet: cutover mounts it under `/api/v1` and empties the legacy
 * block, so `/openapi.json` stays byte-identical in this slice.
 */

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface CatalogRouterDeps {
  listPublished(query: CatalogListQuery): Promise<unknown>;
  getPublishedById(id: string): Promise<unknown | null>;
  listSlides(): Promise<unknown>;
}

export function createCatalogRouter(deps: CatalogRouterDeps): Router {
  const router: Router = Router();

  router.get(
    "/products",
    validate(catalogListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await deps.listPublished(req.query as unknown as CatalogListQuery)));
    })
  );

  router.get(
    "/products/:id",
    validate(catalogIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      const product = await deps.getPublishedById(id);
      if (product === null) throw new NotFoundError(`Producto no encontrado: ${id}`);
      res.json(buildSuccessEnvelope(product));
    })
  );

  router.get(
    "/promo-slides",
    asyncHandler(async (_req, res) => {
      res.json(buildSuccessEnvelope(await deps.listSlides()));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
