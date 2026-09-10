import { Router, type Request, type Response } from "express";
import { NotFoundError } from "../../../errors/taxonomy.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import { interfaceErrorHandler, renderError } from "../errorHandler.js";
import type { Identity } from "../edge/auth.js";
import { validate } from "../edge/validate.js";
import {
  receiptCreateBodySchema,
  receiptIdParamSchema,
  receiptsListQuerySchema,
  repairStatusBodySchema,
  type ReceiptCreateBody,
  type ReceiptsListQuery,
  type RepairStatusBody
} from "./dtos.js";

/**
 * Receipt/Ticket slice thin router (interface layer, Unidad 5).
 *
 * Validate-handler-envelope only: each route validates its strict DTO at
 * the edge (failures → 422 via `validate`), calls exactly one injected
 * handler, and renders the frozen envelope (200/201 on success, taxonomy
 * status otherwise via `renderError`). No business rules, no role gates
 * (applied at wiring), no raw pg, adapters, mappers, or SDK clients —
 * handlers only. NOT mounted in the composition root yet (cutover PR8);
 * the legacy `gestion` router still serves these paths, so the observable
 * contract (`/openapi.json`, matrix) is unchanged.
 *
 * Ticket PDF: the `/:id/invoice` route serves the bytes returned by the
 * injected `getInvoicePdf` handler untouched (no re-render, no re-encode)
 * with the legacy headers (`application/pdf`, `inline; filename=...`), so
 * the A5 non-fiscal output stays byte-identical. At cutover the handler is
 * wired to the legacy-equivalent composition (receipt read + template
 * settings + ticket document + PDF render, raising `NotFoundError` with
 * the `Recibo no encontrado: <id>` message on unknown ids).
 */

/** Audit journal actor — same shape the legacy `toAuditActor` builds. */
export interface ReceiptAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
}

/** Ticket PDF result: raw bytes plus the receipt number for the filename. */
export interface ReceiptInvoicePdf {
  pdf: Uint8Array;
  receiptNumber: string | number;
}

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface ReceiptRouterDeps {
  nextNumber(): Promise<number>;
  listReceipts(filter: ReceiptsListQuery): Promise<unknown>;
  createReceipt(input: ReceiptCreateBody): Promise<unknown>;
  getReceiptById(id: string): Promise<unknown | null>;
  annulReceipt(id: string, actor: ReceiptAuditActor): Promise<unknown>;
  transitionRepairStatus(id: string, status: string, actor: ReceiptAuditActor): Promise<unknown>;
  getInvoicePdf(receiptId: string): Promise<ReceiptInvoicePdf>;
}

function toAuditActor(identity: Identity | undefined): ReceiptAuditActor {
  return { actorUserId: identity?.userId ?? null, actorRole: identity?.roles[0] ?? null };
}

export function createReceiptRouter(deps: ReceiptRouterDeps): Router {
  const router = Router();

  router.get("/receipts/next-number", async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(buildSuccessEnvelope({ receiptNumber: await deps.nextNumber() }));
    } catch (err) {
      const { status, body } = renderError(err);
      res.status(status).json(body);
    }
  });

  router.get(
    "/receipts",
    validate(receiptsListQuerySchema, "query"),
    async (req: Request, res: Response): Promise<void> => {
      try {
        // `validate` replaced req.query with the parsed DTO at runtime; Express
        // still types it as ParsedQs, hence the double assertion.
        res.json(buildSuccessEnvelope(await deps.listReceipts(req.query as unknown as ReceiptsListQuery)));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.post(
    "/receipts",
    validate(receiptCreateBodySchema),
    async (req: Request, res: Response): Promise<void> => {
      try {
        res.status(201).json(buildSuccessEnvelope(await deps.createReceipt(req.body as ReceiptCreateBody)));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.get(
    "/receipts/:id",
    validate(receiptIdParamSchema, "params"),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const id = req.params.id as string;
        const receipt = await deps.getReceiptById(id);
        if (receipt === null) throw new NotFoundError(`Recibo no encontrado: ${id}`);
        res.json(buildSuccessEnvelope(receipt));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.get(
    "/receipts/:id/invoice",
    validate(receiptIdParamSchema, "params"),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { pdf, receiptNumber } = await deps.getInvoicePdf(req.params.id as string);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="ticket-${receiptNumber}.pdf"`);
        res.send(Buffer.from(pdf));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.post(
    "/receipts/:id/annul",
    validate(receiptIdParamSchema, "params"),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const id = req.params.id as string;
        res.json(buildSuccessEnvelope(await deps.annulReceipt(id, toAuditActor(req.identity))));
      } catch (err) {
        const { status, body } = renderError(err);
        res.status(status).json(body);
      }
    }
  );

  router.post(
    "/receipts/:id/status",
    validate(receiptIdParamSchema, "params"),
    validate(repairStatusBodySchema),
    async (req: Request, res: Response): Promise<void> => {
      try {
        const id = req.params.id as string;
        const { status } = req.body as RepairStatusBody;
        res.json(
          buildSuccessEnvelope(await deps.transitionRepairStatus(id, status, toAuditActor(req.identity)))
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
