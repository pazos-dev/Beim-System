/**
 * Gestion module router (PR 3).
 *
 * Mounted at /api/v1 (see app.ts). Every route is role-gated
 * (NOT_FOUND_OR_FORBIDDEN policy from middleware/auth.ts): no identity → 404,
 * unmatched role → 403. Writes that move money/stock (sales-batch, receipts,
 * cash-sessions, movements, clients) need OPERATOR roles; catalog/service/
 * purchase CREATION needs ADMIN roles; reads are operator-level.
 *
 * Status codes: 201 for creates, 200 otherwise. Errors flow to the central
 * errorHandler as envelopes.
 */
import { Router } from "express";
import { buildSuccessEnvelope } from "../../errors/envelope.js";
import { NotFoundError } from "../../errors/taxonomy.js";
import { asyncHandler } from "../../middleware/error-handler.js";
import { requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";

import {
  cashSessionCloseSchema,
  cashSessionMovementSchema,
  cashSessionOpenSchema,
  categoryCreateSchema,
  clientCreateSchema,
  financialStateSchema,
  paramIdSchema,
  purchaseCreateSchema,
  receiptCreateSchema,
  receiptsListQuerySchema,
  salesBatchSchema,
  serviceCreateSchema,
  stockMovementSchema,
  stockMovementsQuerySchema
} from "./schemas.js";
import { salesBatchService } from "./services/sales-batch.js";
import { receiptsService } from "./services/receipts.js";
import { financialStateService } from "./services/financial-state.js";
import { cashSessionsService } from "./services/cash-sessions.js";
import { stockMovementsService } from "./services/stock-movements.js";
import { categoriesService, clientsService, purchasesService, servicesService } from "./services/crud.js";

const OPERATOR_ROLES = ["vendedor", "tecnico", "caja", "administrador", "administrador_principal"];
const ADMIN_ROLES = ["administrador", "administrador_principal", "admin", "superadmin"];

const operator = requireRole(...OPERATOR_ROLES);
const admin = requireRole(...ADMIN_ROLES);

export const gestionRouter: Router = Router();

/* ------------------------------- sales-batch ------------------------------ */

gestionRouter.post(
  "/sales-batch",
  operator,
  validate(salesBatchSchema),
  asyncHandler(async (req, res) => {
    const result = await salesBatchService.run(req.body);
    res.status(201).json(buildSuccessEnvelope(result));
  })
);

/* -------------------------------- receipts -------------------------------- */

gestionRouter.get(
  "/receipts/next-number",
  operator,
  asyncHandler(async (_req, res) => {
    const receiptNumber = await receiptsService.nextNumber();
    res.json(buildSuccessEnvelope({ receiptNumber }));
  })
);

gestionRouter.get(
  "/receipts",
  operator,
  validate(receiptsListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const result = await receiptsService.list(req.query);
    res.json(buildSuccessEnvelope(result));
  })
);

gestionRouter.post(
  "/receipts",
  operator,
  validate(receiptCreateSchema),
  asyncHandler(async (req, res) => {
    const receipt = await receiptsService.create(req.body);
    res.status(201).json(buildSuccessEnvelope(receipt));
  })
);

gestionRouter.get(
  "/receipts/:id",
  operator,
  validate(paramIdSchema, "params"),
  asyncHandler(async (req, res) => {
    const receipt = await receiptsService.getById(req.params.id as string);
    if (receipt === null) throw new NotFoundError(`Recibo no encontrado: ${req.params.id as string}`);
    res.json(buildSuccessEnvelope(receipt));
  })
);

gestionRouter.post(
  "/receipts/:id/annul",
  operator,
  validate(paramIdSchema, "params"),
  asyncHandler(async (req, res) => {
    const result = await receiptsService.annul(req.params.id as string);
    res.json(buildSuccessEnvelope(result));
  })
);

/* ----------------------------- financial state ---------------------------- */

gestionRouter.get(
  "/financial-state",
  operator,
  asyncHandler(async (_req, res) => {
    res.json(buildSuccessEnvelope(await financialStateService.get()));
  })
);

gestionRouter.put(
  "/financial-state",
  operator,
  validate(financialStateSchema),
  asyncHandler(async (req, res) => {
    res.json(buildSuccessEnvelope(await financialStateService.upsert(req.body)));
  })
);

/* ------------------------------ cash sessions ----------------------------- */

gestionRouter.get(
  "/cash-sessions/current",
  operator,
  asyncHandler(async (_req, res) => {
    const session = await cashSessionsService.current();
    if (session === null) throw new NotFoundError("No hay ninguna sesión de caja abierta");
    res.json(buildSuccessEnvelope(session));
  })
);

gestionRouter.get(
  "/cash-sessions",
  operator,
  asyncHandler(async (_req, res) => {
    res.json(buildSuccessEnvelope(await cashSessionsService.list()));
  })
);

gestionRouter.post(
  "/cash-sessions",
  operator,
  validate(cashSessionOpenSchema),
  asyncHandler(async (req, res) => {
    const session = await cashSessionsService.open(req.body);
    res.status(201).json(buildSuccessEnvelope(session));
  })
);

gestionRouter.post(
  "/cash-sessions/:id/close",
  operator,
  validate(paramIdSchema, "params"),
  validate(cashSessionCloseSchema),
  asyncHandler(async (req, res) => {
    const session = await cashSessionsService.close(req.params.id as string, req.body.countedAmount);
    res.json(buildSuccessEnvelope(session));
  })
);

gestionRouter.post(
  "/cash-sessions/:id/movements",
  operator,
  validate(paramIdSchema, "params"),
  validate(cashSessionMovementSchema),
  asyncHandler(async (req, res) => {
    const movement = await cashSessionsService.recordMovement(req.params.id as string, req.body);
    res.status(201).json(buildSuccessEnvelope(movement));
  })
);

/* ----------------------------- stock movements ---------------------------- */

gestionRouter.get(
  "/stock-movements",
  operator,
  validate(stockMovementsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.json(buildSuccessEnvelope(await stockMovementsService.list(req.query)));
  })
);

gestionRouter.post(
  "/stock-movements",
  operator,
  validate(stockMovementSchema),
  asyncHandler(async (req, res) => {
    const movement = await stockMovementsService.record(req.body);
    res.status(201).json(buildSuccessEnvelope(movement));
  })
);

/* --------------------------------- clients -------------------------------- */

gestionRouter.get(
  "/clients",
  operator,
  asyncHandler(async (_req, res) => {
    res.json(buildSuccessEnvelope(await clientsService.list()));
  })
);

gestionRouter.get(
  "/clients/:id",
  operator,
  validate(paramIdSchema, "params"),
  asyncHandler(async (req, res) => {
    const client = await clientsService.getById(req.params.id as string);
    if (client === null) throw new NotFoundError(`Cliente no encontrado: ${req.params.id as string}`);
    res.json(buildSuccessEnvelope(client));
  })
);

gestionRouter.post(
  "/clients",
  operator,
  validate(clientCreateSchema),
  asyncHandler(async (req, res) => {
    const client = await clientsService.create(req.body);
    res.status(201).json(buildSuccessEnvelope(client));
  })
);

/* ------------------------------- categories ------------------------------- */

gestionRouter.get(
  "/categories",
  operator,
  asyncHandler(async (_req, res) => {
    res.json(buildSuccessEnvelope(await categoriesService.list()));
  })
);

gestionRouter.get(
  "/categories/:id",
  operator,
  asyncHandler(async (req, res) => {
    const category = await categoriesService.getById(req.params.id as string);
    if (category === null) throw new NotFoundError(`Categoría no encontrada: ${req.params.id as string}`);
    res.json(buildSuccessEnvelope(category));
  })
);

gestionRouter.post(
  "/categories",
  admin,
  validate(categoryCreateSchema),
  asyncHandler(async (req, res) => {
    const category = await categoriesService.create(req.body);
    res.status(201).json(buildSuccessEnvelope(category));
  })
);

/* -------------------------------- services --------------------------------- */

gestionRouter.get(
  "/services",
  operator,
  asyncHandler(async (_req, res) => {
    res.json(buildSuccessEnvelope(await servicesService.list()));
  })
);

gestionRouter.post(
  "/services",
  admin,
  validate(serviceCreateSchema),
  asyncHandler(async (req, res) => {
    const service = await servicesService.create(req.body);
    res.status(201).json(buildSuccessEnvelope(service));
  })
);

/* -------------------------------- purchases -------------------------------- */

gestionRouter.get(
  "/purchases",
  operator,
  asyncHandler(async (_req, res) => {
    res.json(buildSuccessEnvelope(await purchasesService.list()));
  })
);

gestionRouter.post(
  "/purchases",
  admin,
  validate(purchaseCreateSchema),
  asyncHandler(async (req, res) => {
    const purchase = await purchasesService.create(req.body);
    res.status(201).json(buildSuccessEnvelope(purchase));
  })
);