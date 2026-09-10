import { Router, type RequestHandler } from "express";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  categoriesListQuerySchema,
  categoryCreateBodySchema,
  categoryIdParamSchema,
  categoryUpdateBodySchema,
  type CategoriesListQuery,
  type CategoryCreateBody,
  type CategoryUpdateBody
} from "./dtos.js";

/**
 * Category thin router (interface layer, G1 categories slice).
 *
 * Legacy-equivalent mirror of `GET /categories` (operator query `active`),
 * `GET /categories/:id` (operator, text id, 404), `POST /categories`
 * (admin, 201) and `PUT /categories/:id` (admin, text id): validate at the
 * edge (strict zod, 422) -> exactly one injected handler -> frozen success
 * envelope. Like legacy, `GET /:id` carries no param validation — unknown
 * ids surface as the frozen 404 (`Categoría no encontrada: <id>`). No
 * business rules, no role gates (applied at wiring), no pg, no adapters,
 * no mappers. Unmounted until cutover, so the OpenAPI snapshot stays
 * byte-identical.
 */
export interface CategoryRouterHandlers {
  list(filter: CategoriesListQuery): Promise<unknown>;
  getById(id: string): Promise<unknown | null>;
  create(input: CategoryCreateBody): Promise<unknown>;
  update(id: string, patch: CategoryUpdateBody): Promise<unknown>;
}

const asyncHandler =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };

function categoryId(req: Parameters<RequestHandler>[0]): string {
  return req.params.id as string;
}

export function makeCategoryRouter(handlers: CategoryRouterHandlers): Router {
  const router = Router();

  router.get(
    "/",
    validate(categoriesListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await handlers.list(req.query as unknown as CategoriesListQuery)));
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const id = categoryId(req);
      const category = await handlers.getById(id);
      if (category === null) throw new NotFoundError(`Categoría no encontrada: ${id}`);
      res.json(buildSuccessEnvelope(category));
    })
  );

  router.post(
    "/",
    validate(categoryCreateBodySchema),
    asyncHandler(async (req, res) => {
      const created = await handlers.create(req.body as CategoryCreateBody);
      res.status(201).json(buildSuccessEnvelope(created));
    })
  );

  router.put(
    "/:id",
    validate(categoryIdParamSchema, "params"),
    validate(categoryUpdateBodySchema),
    asyncHandler(async (req, res) => {
      const updated = await handlers.update(categoryId(req), req.body as CategoryUpdateBody);
      res.json(buildSuccessEnvelope(updated));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
