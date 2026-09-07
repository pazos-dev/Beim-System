/**
 * Storage port for webshop uploads (issue #96).
 *
 * Proxy design: the public contract (uuid filenames, allowlisted raster
 * extensions, `/api/v1/uploads/<file>` URLs, Content-Type + nosniff serve)
 * stays identical. Only the byte backend changes: local disk by default,
 * S3-compatible when `S3_BUCKET` is set. Credentials never hit logs.
 *
 * The content-type allowlist lives here (single owner) and is re-exported
 * from `uploads.js` so existing import paths keep working.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { webshopConfig } from "../config.js";

export const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif"
  // NOTE: image/svg+xml is deliberately NOT allowlisted. SVG is active
  // content: served back with its content-type, an embedded <script> would
  // execute as stored XSS in the API origin. Raster formats only.
};

export interface StoredObject {
  bytes: Buffer;
  contentType: string;
}

/**
 * Minimal byte-store contract both backends honor. Filenames are already
 * validated (`uuid.ext`) by `uploadsService` before reaching here.
 */
export interface StoragePort {
  put(filename: string, bytes: Buffer, contentType: string): Promise<void>;
  get(filename: string): Promise<StoredObject | null>;
}

function contentTypeFor(filename: string): string | undefined {
  const extension = filename.split(".").pop() as string;
  return Object.keys(EXTENSION_BY_CONTENT_TYPE).find(
    (type) => EXTENSION_BY_CONTENT_TYPE[type] === extension
  );
}

/**
 * Filesystem backend — the previous inline logic in `uploadsService`,
 * moved verbatim: recursive mkdir, exclusive `wx` create, plain read.
 * The directory resolves lazily per call so tests can repoint
 * `UPLOADS_DIR` between requests.
 */
export class LocalStorage implements StoragePort {
  constructor(private readonly resolveDir: () => string = () => webshopConfig().uploadsDir) {}

  async put(filename: string, bytes: Buffer, _contentType: string): Promise<void> {
    const dir = this.resolveDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), bytes, { flag: "wx" });
  }

  async get(filename: string): Promise<StoredObject | null> {
    const contentType = contentTypeFor(filename);
    if (contentType === undefined) return null;
    try {
      const bytes = await readFile(join(this.resolveDir(), filename));
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
}
