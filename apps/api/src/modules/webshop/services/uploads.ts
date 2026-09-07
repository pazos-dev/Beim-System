/**
 * Image upload + serving (PR 4) — webshop-api/spec.md "Uploads".
 *
 * Upload policy: RAW binary body (no multipart/deps) with a supported image
 * Content-Type. The content type decides the extension (never the payload);
 * unknown types are rejected 415 BEFORE any byte is read. The body is
 * buffered with a hard cap (webshopConfig().maxUploadBytes) — over the cap
 * throws 413 and nothing is written. Files land as `<uuid>.<ext>` in the
 * active storage (local `UPLOADS_DIR` by default, S3-compatible bucket when
 * `S3_BUCKET` is set — issue #96). Serving validates the filename strictly
 * (uuid + allowed extension) so traversal is impossible (404, never a
 * storage error).
 */
import { randomUUID } from "node:crypto";
import { PayloadTooLargeError, UnsupportedMediaTypeError } from "../../../errors/taxonomy.js";
import type { AuditLogActor } from "../../gestion/ports.js";
import { webshopConfig } from "../config.js";
import { EXTENSION_BY_CONTENT_TYPE, LocalStorage, type StoragePort } from "./storage.js";
import { createS3StorageFromEnv, isS3Enabled } from "./storage-s3.js";

// Re-exported so existing import paths keep working; storage.ts owns the map.
export { EXTENSION_BY_CONTENT_TYPE };
export type { StoragePort };

const ALLOWED_EXTENSIONS = new Set(Object.values(EXTENSION_BY_CONTENT_TYPE));
void ALLOWED_EXTENSIONS;
const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif)$/;

export function isValidPublicFilename(filename: string): boolean {
  return FILENAME_RE.test(filename);
}

/** Test seam: an explicitly injected backend wins over env selection. */
let storageOverride: StoragePort | null = null;

export function setUploadsStorage(storage: StoragePort | null): void {
  storageOverride = storage;
}

/**
 * Backend selection, resolved lazily per call so tests can flip env
 * between requests: `S3_BUCKET` set → S3, otherwise local disk.
 */
export function resolveUploadsStorage(env: NodeJS.ProcessEnv = process.env): StoragePort {
  if (storageOverride !== null) return storageOverride;
  if (isS3Enabled(env)) {
    const s3 = createS3StorageFromEnv(env);
    if (s3 !== null) return s3;
  }
  return new LocalStorage();
}

export interface StoredUpload {
  /** Public path: `/api/v1/uploads/<uuid>.<ext>`. */
  url: string;
  filename: string;
  bytes: number;
}

export const uploadsService = {
  /**
   * Buffers a raw image body with a size cap and stores it atomically.
   * @param body Node stream (Express request body for non-JSON content types)
   * @param storage Optional backend (tests); defaults to env selection.
   */
  async storeImage(
    body: NodeJS.ReadableStream,
    contentType: string,
    storage?: StoragePort,
    actor: AuditLogActor = {}
  ): Promise<StoredUpload> {
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    if (extension === undefined) {
      throw new UnsupportedMediaTypeError(undefined, { supported: Object.keys(EXTENSION_BY_CONTENT_TYPE) });
    }

    const maxBytes = webshopConfig().maxUploadBytes;
    const chunks: Buffer[] = [];
    let received = 0;

    for await (const chunk of body as AsyncIterable<Buffer>) {
      received += chunk.length;
      if (received > maxBytes) {
        throw new PayloadTooLargeError(undefined, { maxBytes });
      }
      chunks.push(chunk);
    }

    const backend = storage ?? resolveUploadsStorage();
    const id = randomUUID();
    const filename = `${id}.${extension}`;
    await backend.put(filename, Buffer.concat(chunks), contentType);

    // Audit journal (issue #97): admin uploads only; best-effort so storage
    // failures/success responses never change shape. Lazy import: this
    // module must stay loadable without DATABASE_URL (storage unit tests).
    try {
      const { auditLogsRepository } = await import("../../gestion/repositories/pg-audit-logs.js");
      await auditLogsRepository.insert({
        actorUserId: actor.actorUserId ?? null,
        actorRole: actor.actorRole ?? null,
        action: "upload.image",
        entityType: "upload",
        entityId: filename,
        details: { filename, bytes: received, contentType }
      });
    } catch {
      // Best-effort: the upload already succeeded, never fail the response.
    }

    return { url: `/api/v1/uploads/${filename}`, filename, bytes: received };
  },

  /**
   * Resolves a public filename to stored bytes; null when invalid/missing.
   * @param storage Optional backend (tests); defaults to env selection.
   */
  async load(
    filename: string,
    storage?: StoragePort
  ): Promise<{ bytes: Buffer; contentType: string } | null> {
    if (!isValidPublicFilename(filename)) return null;
    const backend = storage ?? resolveUploadsStorage();
    return backend.get(filename);
  }
};
