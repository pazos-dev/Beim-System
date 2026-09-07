/**
 * Storage port unit tests (issue #96) — DB-free.
 *
 * Covers the contract every backend honors (put/get roundtrip, missing →
 * null), the LocalStorage filesystem backend against a real tmpdir, and
 * backend selection (local by default, S3 when `S3_BUCKET` is set,
 * explicit override wins).
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalStorage, type StoragePort, type StoredObject } from "./storage.js";
import { S3Storage } from "./storage-s3.js";

/** In-memory fake proving the port contract any backend must honor. */
class MemoryStorage implements StoragePort {
  private readonly objects = new Map<string, StoredObject>();

  async put(filename: string, bytes: Buffer, contentType: string): Promise<void> {
    this.objects.set(filename, { bytes: Buffer.from(bytes), contentType });
  }

  async get(filename: string): Promise<StoredObject | null> {
    return this.objects.get(filename) ?? null;
  }
}

const FILENAME = "123e4567-e89b-12d3-a456-426614174000.png";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("StoragePort contract (in-memory fake)", () => {
  it("roundtrips put → get with bytes and content type intact", async () => {
    const storage = new MemoryStorage();
    await storage.put(FILENAME, PNG, "image/png");
    const loaded = await storage.get(FILENAME);
    expect(loaded?.bytes).toEqual(PNG);
    expect(loaded?.contentType).toBe("image/png");
  });

  it("returns null for a missing key", async () => {
    const storage = new MemoryStorage();
    await expect(storage.get("123e4567-e89b-12d3-a456-426614174001.png")).resolves.toBeNull();
  });
});

describe("LocalStorage", () => {
  it("roundtrips bytes through a real tmpdir and derives the content type", async () => {
    const dir = mkdtempSync(join(tmpdir(), "beim-storage-"));
    const storage = new LocalStorage(() => dir);
    await storage.put(FILENAME, PNG, "image/png");
    const loaded = await storage.get(FILENAME);
    expect(loaded?.bytes).toEqual(PNG);
    expect(loaded?.contentType).toBe("image/png");
  });

  it("returns null for a missing file (never throws)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "beim-storage-"));
    const storage = new LocalStorage(() => dir);
    await expect(storage.get(FILENAME)).resolves.toBeNull();
  });

  it("returns null for an unknown extension instead of touching disk", async () => {
    const exploding = new LocalStorage(() => {
      throw new Error("must not reach the filesystem for bad extensions");
    });
    await expect(exploding.get("123e4567-e89b-12d3-a456-426614174000.txt")).resolves.toBeNull();
  });
});

describe("resolveUploadsStorage", () => {
  const KEYS = ["S3_BUCKET", "S3_REGION", "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_FORCE_PATH_STYLE"];
  const saved = new Map<string, string | undefined>();

  afterEach(async () => {
    for (const key of KEYS) {
      if (saved.get(key) === undefined) delete process.env[key];
      else process.env[key] = saved.get(key)!;
    }
    saved.clear();
    const { setUploadsStorage } = await import("./uploads.js");
    setUploadsStorage(null);
  });

  async function snapshotEnv(): Promise<void> {
    saved.clear();
    for (const key of KEYS) saved.set(key, process.env[key]);
    for (const key of KEYS) delete process.env[key];
  }

  it("defaults to local disk without S3 env", async () => {
    await snapshotEnv();
    const { resolveUploadsStorage } = await import("./uploads.js");
    expect(resolveUploadsStorage()).toBeInstanceOf(LocalStorage);
  });

  it("selects S3 when S3_BUCKET is set", async () => {
    await snapshotEnv();
    process.env.S3_BUCKET = "beim-uploads";
    const { resolveUploadsStorage } = await import("./uploads.js");
    expect(resolveUploadsStorage()).toBeInstanceOf(S3Storage);
  });

  it("lets an explicit override win over env selection", async () => {
    await snapshotEnv();
    process.env.S3_BUCKET = "beim-uploads";
    const { resolveUploadsStorage, setUploadsStorage } = await import("./uploads.js");
    const fake = new MemoryStorage();
    setUploadsStorage(fake);
    expect(resolveUploadsStorage()).toBe(fake);
  });
});
