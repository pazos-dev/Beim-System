import { Router, type RequestHandler } from "express";
import type {
  RenameServiceInput,
  RepriceServiceInput,
  ServiceIdInput,
  UpdateServiceRequest
} from "../../../application/catalog/service-handlers.js";
import type { CreateServiceInput, UpdateServiceInput } from "../../../domain/service/service.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { validate } from "../edge/validate.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import {
  serviceCreateBodySchema,
  serviceIdParamSchema,
  serviceRenameBodySchema,
  serviceRepriceBodySchema,
  serviceUpdateBodySchema,
  servicesListQuerySchema,
  type ServiceUpdateBody,
  type ServicesListQuery
} from "./dtos.js";

/**
 * Service thin router (interface layer, Unidad 3 catalog slice + G5 reads).
 *
 * Legacy-equivalent mirror of the gestion `services` block: `GET /`
 * (operator `active` query), `GET /:id` (operator uuid, 404
 * `Servicio no encontrado: <id>`), `POST /` (admin, 201) and `PUT /:id`
 * (admin uuid, patch merge) — validate at the edge (strict zod, 422) ->
 * exactly one catalog handler -> frozen success envelope. Role gates live
 * at wiring (cutover `operatorGuard` for the GETs, `adminGuard` for
 * POST/PUT), never inside the router. The domain-only routes (`rename`,
 * `reprice`, `activate`, `deactivate`) have no legacy counterpart and stay
 * out of cutover: only the GETs plus the legacy writes mount. No rules,
 * no pg, no adapters, no mappers. Unmounted until cutover (PR8): snapshot
 * untouched.
 */
export interface ServiceRouterHandlers {
  list(filter: ServicesListQuery): Promise<unknown>;
  getById(id: string): Promise<unknown | null>;
  create(input: CreateServiceInput): Promise<unknown>;
  rename(input: RenameServiceInput): Promise<unknown>;
  reprice(input: RepriceServiceInput): Promise<unknown>;
  update(input: UpdateServiceRequest): Promise<unknown>;
  activate(input: ServiceIdInput): Promise<unknown>;
  deactivate(input: ServiceIdInput): Promise<unknown>;
}

const asyncHandler =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  (req, res, next): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };

function serviceId(req: Parameters<RequestHandler>[0]): string {
  return req.params.id as string;
}

export function makeServiceRouter(handlers: ServiceRouterHandlers): Router {
  const router = Router();

  router.get(
    "/",
    validate(servicesListQuerySchema, "query"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await handlers.list(req.query as unknown as ServicesListQuery)));
    })
  );

  router.get(
    "/:id",
    validate(serviceIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      const id = serviceId(req);
      const service = await handlers.getById(id);
      if (service === null) throw new NotFoundError(`Servicio no encontrado: ${id}`);
      res.json(buildSuccessEnvelope(service));
    })
  );

  router.post(
    "/",
    validate(serviceCreateBodySchema),
    asyncHandler(async (req, res) => {
      const created = await handlers.create(req.body as CreateServiceInput);
      res.status(201).json(buildSuccessEnvelope(created));
    })
  );

  router.patch(
    "/:id/rename",
    validate(serviceIdParamSchema, "params"),
    validate(serviceRenameBodySchema),
    asyncHandler(async (req, res) => {
      const renamed = await handlers.rename({ serviceId: serviceId(req), name: req.body.name as string });
      res.json(buildSuccessEnvelope(renamed));
    })
  );

  router.patch(
    "/:id/reprice",
    validate(serviceIdParamSchema, "params"),
    validate(serviceRepriceBodySchema),
    asyncHandler(async (req, res) => {
      const repriced = await handlers.reprice({ serviceId: serviceId(req), amount: req.body.amount as number });
      res.json(buildSuccessEnvelope(repriced));
    })
  );

  router.put(
    "/:id",
    validate(serviceIdParamSchema, "params"),
    validate(serviceUpdateBodySchema),
    asyncHandler(async (req, res) => {
      const updated = await handlers.update({
        serviceId: serviceId(req),
        patch: req.body as ServiceUpdateBody as UpdateServiceInput
      });
      res.json(buildSuccessEnvelope(updated));
    })
  );

  router.post(
    "/:id/activate",
    validate(serviceIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await handlers.activate({ serviceId: serviceId(req) })));
    })
  );

  router.post(
    "/:id/deactivate",
    validate(serviceIdParamSchema, "params"),
    asyncHandler(async (req, res) => {
      res.json(buildSuccessEnvelope(await handlers.deactivate({ serviceId: serviceId(req) })));
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
