/**
 * Image upload + serving (PR 4) — webshop-api/spec.md "Uploads".
 *
 * Upload policy: RAW binary body (no multipart/deps) with a supported image
 * Content-Type. The content type decides the extension (never the payload);
 * unknown types are rejected 415 BEFORE any byte is read. The body is
 * buffered with a hard cap (webshopConfig().maxUploadBytes) — over the cap
 * throws 413 and nothing is written. Files land as `<uuid>.<ext>` under
 * UPLOADS_DIR. Serving validates the filename strictly (uuid + allowed
 * extension) so traversal is impossible (404, never a filesystem error).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PayloadTooLargeError, UnsupportedMediaTypeError } from "../../../errors/taxonomy.js";
import { webshopConfig } from "../config.js";

export const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg"
};

const ALLOWED_EXTENSIONS = new Set(Object.values(EXTENSION_BY_CONTENT_TYPE));

/** uuid v4 + one of the allowed extensions — the only valid public filename. */
const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif|svg)$/;

export function isValidPublicFilename(filename: string): boolean {
  return FILENAME_RE.test(filename);
}

async function ensureUploadsDir(): Promise<string> {
  const dir = webshopConfig().uploadsDir;
  await mkdir(dir, { recursive: true });
  return dir;
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
   */
  async storeImage(body: NodeJS.ReadableStream, contentType: string): Promise<StoredUpload> {
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

    const dir = await ensureUploadsDir();
    const id = randomUUID();
    const filename = `${id}.${extension}`;
    await writeFile(join(dir, filename), Buffer.concat(chunks), { flag: "wx" });

    return { url: `/api/v1/uploads/${filename}`, filename, bytes: received };
  },

  /** Resolves a public filename to stored bytes; null when invalid/missing. */
  async load(filename: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    if (!isValidPublicFilename(filename)) return null;
    const extension = filename.split(".").pop() as string;
    const contentType = Object.keys(EXTENSION_BY_CONTENT_TYPE).find(
      (type) => EXTENSION_BY_CONTENT_TYPE[type] === extension
    );
    if (contentType === undefined) return null;

    const dir = webshopConfig().uploadsDir;
    try {
      const bytes = await readFile(join(dir, filename));
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
};