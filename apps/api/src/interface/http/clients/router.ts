import { Router, type RequestHandler } from "express";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  clientCreateBodySchema,
  clientIdParamSchema,
  clientUpdateBodySchema,
  clientsListQuerySchema,
  type ClientCreateBody,
  type ClientUpdateBody,
  type ClientsListQuery
} from "./dtos.js";

/**
 * Client thin router (interface layer, G1 clients slice).
 *
 * Legacy-equivalent mirror of `GET/POST /clients` + `GET/PUT /clients/:id`
 * (gestion router, operator guard): validate at the edge (strict zod, 422)
 * -> exactly one injected handler -> frozen success envelope (200/201,
 * 404 with the legacy `Cliente no encontrado: <id>` message on unknown
 * ids). No business rules, no role gates (applied at wiring), no pg, no
 * adapters, no mappers: the router only translates transport shapes into
 * handler inputs. Unmounted until cutover, so the OpenAPI snapshot stays
 * byte-identical.
 */
export interface ClientRouterHandlers {
  list(filter: ClientsListQuery): Promise<unknown>;
  getById(id: string): Promise<unknown | null>;
  create(input: ClientCreateBody): Promise<unknown>;
  update(id: string, patch: ClientUpdateBody): Promise<unknown>;
}

const asyncHandler =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };

function clientId(req: Parameters<RequestHandler>[0]): string {
  return req.params.id as string;
}

export function makeClientRouter(handlers: ClientRouterHandlers): Router {
  const router = Router();

  router.get(
    "/",
    validate(clientsListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await handlers.list(req.query as unknown as ClientsListQuery)));
    })
  );

  router.get(
    "/:id",
    validate(clientIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = clientId(req);
      const client = await handlers.getById(id);
      if (client === null) throw new NotFoundError(`Cliente no encontrado: ${id}`);
      res.json(buildSuccessEnvelope(client));
    })
  );

  router.post(
    "/",
    validate(clientCreateBodySchema),
    asyncHandler(async (req, res) => {
      const created = await handlers.create(req.body as ClientCreateBody);
      res.status(201).json(buildSuccessEnvelope(created));
    })
  );

  router.put(
    "/:id",
    validate(clientIdParamSchema, "params"),
    validate(clientUpdateBodySchema),
    asyncHandler(async (req, res) => {
      const updated = await handlers.update(clientId(req), req.body as ClientUpdateBody);
      res.json(buildSuccessEnvelope(updated));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
