import { Router } from "express";
import type { Request } from "express";
import type { Identity } from "../edge/auth.js";
import { requireRole } from "../edge/auth.js";
import { rateLimit } from "../edge/rate-limit.js";
import { asyncHandler } from "../../../middleware/error-handler.js";
import { buildSuccessEnvelope } from "../../../errors/envelope.js";
import {
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError
} from "../../../errors/taxonomy.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import { EXTENSION_BY_CONTENT_TYPE, uploadFilenameParamSchema } from "./dtos.js";

/**
 * Upload thin router (interface layer, Unidad 6).
 *
 * Raw-binary edge → call exactly one injected handler → render the frozen
 * envelope. No business rules, no data access, no infrastructure imports:
 * every dependency is supplied by the composition root (fakes in tests;
 * application upload handlers at cutover). Routes, envelopes and statuses
 * mirror the legacy `webshop/router.ts` uploads block — zero observable
 * change.
 *
 * Edge policy (mirrors `uploadsService.storeImage` order): the Content-Type
 * allowlist rejects 415 BEFORE any byte is read; the body is then buffered
 * with a hard cap (`maxUploadBytes`, injected so the router never imports
 * config) and over-cap bodies fail 413 with nothing stored. Serving keeps
 * the strict filename shape (uuid + allowed extension) with invalid or
 * missing files mapping to the frozen 404 — never a storage error.
 *
 * NOT mounted yet: cutover (PR8) mounts it under `/api/v1` and empties the
 * legacy block, so `/openapi.json` stays byte-identical in this slice.
 */

/** Audit journal actor — same shape the legacy `toAuditActor` builds. */
export interface UploadAuditActor {
  actorUserId: string | null;
  actorRole: string | null;
}

/** Handler surface the router calls; implemented by application handlers at cutover. */
export interface UploadRouterDeps {
  /** Hard body cap in bytes — the composition root forwards `webshopConfig().maxUploadBytes`. */
  maxUploadBytes: number;
  store(input: { contentType: string; bytes: Buffer; actor: UploadAuditActor }): Promise<{ url: string }>;
  load(filename: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

const ADMIN_ROLES = ["administrador", "administrador_principal", "admin", "superadmin"];

function toAuditActor(identity: Identity | undefined): UploadAuditActor {
  return { actorUserId: identity?.userId ?? null, actorRole: identity?.roles[0] ?? null };
}

/** Buffers a raw request body with a hard cap — over-cap bodies fail 413 before anything is stored. */
async function bufferRawBody(req: Request, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    received += chunk.length;
    if (received > maxBytes) {
      throw new PayloadTooLargeError(undefined, { maxBytes });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createUploadRouter(deps: UploadRouterDeps): Router {
  const router: Router = Router();
  const admin = requireRole(...ADMIN_ROLES);
  // Same budget as legacy: mutating upload writes share the 60/min bucket.
  const writeLimiter = rateLimit(60_000, 60);

  router.post(
    "/uploads/product-image",
    admin,
    writeLimiter,
    asyncHandler(async (req, res) => {
      const contentType = req.headers["content-type"];
      if (contentType === undefined) throw new UnsupportedMediaTypeError();
      if (!Object.hasOwn(EXTENSION_BY_CONTENT_TYPE, contentType)) {
        throw new UnsupportedMediaTypeError(undefined, {
          supported: Object.keys(EXTENSION_BY_CONTENT_TYPE)
        });
      }
      const bytes = await bufferRawBody(req, deps.maxUploadBytes);
      const stored = await deps.store({ contentType, bytes, actor: toAuditActor(req.identity) });
      res.status(201).json(buildSuccessEnvelope({ url: stored.url }));
    })
  );

  router.get(
    "/uploads/:filename",
    asyncHandler(async (req, res) => {
      const parsed = uploadFilenameParamSchema.safeParse({ filename: req.params.filename });
      if (!parsed.success) throw new NotFoundError();
      const loaded = await deps.load(parsed.data.filename);
      if (loaded === null) throw new NotFoundError();
      res.setHeader("Content-Type", loaded.contentType);
      // Served bytes are attacker-influenced uploads: force nosniff even
      // though the global security-headers middleware already sets it.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(loaded.bytes);
    })
  );

  router.use(interfaceErrorHandler);
  return router;
}
