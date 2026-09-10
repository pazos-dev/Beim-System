import { z } from "zod";

/**
 * Upload slice DTOs (interface layer, Unidad 6).
 *
 * Edge validation only: the raster allowlist (415) and the public filename
 * shape live here so the thin router enforces them BEFORE any byte is read
 * or any handler runs. The allowlist is an edge-owned copy of the canonical
 * map in `modules/webshop/services/storage.ts` — routers must not import
 * infrastructure or legacy modules (gate import scan), so the five raster
 * types are duplicated deliberately. `image/svg+xml` stays excluded: SVG is
 * active content and would execute as stored XSS in the API origin.
 */

export const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif"
};

/** Public filenames are server-generated `<uuid>.<ext>`; anything else is 404. */
const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp|avif)$/;

/** `GET /uploads/:filename` params — parsed in the router, failures map to 404 (never 422). */
export const uploadFilenameParamSchema = z.strictObject({
  filename: z.string().regex(FILENAME_RE, "Nombre de archivo inválido")
}).strict();

export type UploadFilenameParams = z.infer<typeof uploadFilenameParamSchema>;
