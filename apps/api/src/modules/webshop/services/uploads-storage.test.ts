/**
 * Uploads service over an injected storage backend (issue #96) — DB-free.
 *
 * Proves the proxy keeps its contract regardless of backend: store buffers
 * with the size cap and extension-from-content-type rules, load validates
 * filenames before touching storage, and the S3-backed serve path returns
 * the bytes + content type the router turns into headers (Content-Type +
 * nosniff, unchanged).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { PayloadTooLargeError, UnsupportedMediaTypeError } from "../../../errors/taxonomy.js";
import { EXTENSION_BY_CONTENT_TYPE, type StoragePort, type StoredObject } from "./storage.js";

process.env.UPLOADS_DIR ??= mkdtempSync(join(tmpdir(), "beim-uploads-service-"));

const { setUploadsStorage, uploadsService } = await import("./uploads.js");

/** In-memory stand-in for either backend (local disk or stubbed S3). */
class MemoryStorage implements StoragePort {
  readonly puts: Array<{ filename: string; bytes: Buffer; contentType: string }> = [];
  private readonly objects = new Map<string, StoredObject>();

  async put(filename: string, bytes: Buffer, contentType: string): Promise<void> {
    this.puts.push({ filename, bytes: Buffer.from(bytes), contentType });
    this.objects.set(filename, { bytes: Buffer.from(bytes), contentType });
  }

  async get(filename: string): Promise<StoredObject | null> {
    return this.objects.get(filename) ?? null;
  }
}

function bodyFrom(bytes: Buffer): NodeJS.ReadableStream {
  return Readable.from([bytes]) as unknown as NodeJS.ReadableStream;
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

afterEach(() => {
  setUploadsStorage(null);
  delete process.env.MAX_UPLOAD_BYTES;
});

describe("uploadsService over injected storage", () => {
  it("stores through the backend and serves bytes + content type (serve path)", async () => {
    const storage = new MemoryStorage();
    const stored = await uploadsService.storeImage(bodyFrom(PNG), "image/png", storage);
    expect(stored.url).toBe(`/api/v1/uploads/${stored.filename}`);
    expect(stored.bytes).toBe(PNG.length);
    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0]).toMatchObject({ filename: stored.filename, contentType: "image/png" });
    expect(storage.puts[0].bytes).toEqual(PNG);

    // What GET /uploads/:filename serves: same bytes + headers.
    const served = await uploadsService.load(stored.filename, storage);
    expect(served?.bytes).toEqual(PNG);
    expect(served?.contentType).toBe("image/png");
  });

  it("derives the extension from the content type, never the payload", async () => {
    const storage = new MemoryStorage();
    const stored = await uploadsService.storeImage(bodyFrom(PNG), "image/jpeg", storage);
    expect(stored.filename.endsWith(".jpg")).toBe(true);
    expect((await storage.get(stored.filename))?.contentType).toBe("image/jpeg");
  });

  it("returns null for a well-formed but missing filename without throwing", async () => {
    const storage = new MemoryStorage();
    await expect(
      uploadsService.load("123e4567-e89b-12d3-a456-426614174000.png", storage)
    ).resolves.toBeNull();
  });

  it("rejects invalid filenames before reaching storage", async () => {
    const storage = new MemoryStorage();
    const spy = storage.get.bind(storage);
    let touched = false;
    storage.get = async (filename: string) => {
      touched = true;
      return spy(filename);
    };
    await expect(uploadsService.load("../secret.png", storage)).resolves.toBeNull();
    await expect(uploadsService.load("not-a-uuid.png", storage)).resolves.toBeNull();
    expect(touched).toBe(false);
  });

  it("rejects unsupported content types before reading any byte", async () => {
    const storage = new MemoryStorage();
    await expect(uploadsService.storeImage(bodyFrom(PNG), "image/svg+xml", storage)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeError
    );
    expect(storage.puts).toHaveLength(0);
  });

  it("enforces the size cap without writing", async () => {
    process.env.MAX_UPLOAD_BYTES = "8";
    const storage = new MemoryStorage();
    await expect(uploadsService.storeImage(bodyFrom(PNG), "image/png", storage)).rejects.toBeInstanceOf(
      PayloadTooLargeError
    );
    expect(storage.puts).toHaveLength(0);
  });

  it("honors the setUploadsStorage override (stubbed S3 serve path)", async () => {
    const storage = new MemoryStorage();
    setUploadsStorage(storage);
    const stored = await uploadsService.storeImage(bodyFrom(PNG), "image/png");
    const served = await uploadsService.load(stored.filename);
    expect(served?.bytes).toEqual(PNG);
    expect(served?.contentType).toBe("image/png");
  });

  it("keeps the allowlist intact (SVG stays out)", () => {
    expect(EXTENSION_BY_CONTENT_TYPE["image/svg+xml"]).toBeUndefined();
    expect(Object.keys(EXTENSION_BY_CONTENT_TYPE).sort()).toEqual(
      ["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"].sort()
    );
  });
});
