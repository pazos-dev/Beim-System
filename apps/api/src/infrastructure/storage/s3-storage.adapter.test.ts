/**
 * S3 object-store client (slice 4.2, change `clean-arch-infrastructure`).
 *
 * DB-free, network-free: a stub `send` captures the `PutObjectCommand`
 * input. Credentials arrive only via env (`S3_BUCKET`/`S3_REGION`/…),
 * are never logged, and never cross `domain/`+`application/`.
 */
import { describe, expect, it } from "vitest";

import type { StoragePort } from "../../domain/shared/ports.js";

const { S3StorageAdapter, s3StorageFromEnv } = await import("./s3-storage.adapter.js");

interface Captured {
  Bucket?: string;
  Key?: string;
  Body?: unknown;
  ContentType?: string;
}

function stubClient(captured: Captured[]) {
  return {
    send: async (command: { input: Captured }) => {
      captured.push({ ...command.input });
      return {};
    }
  };
}

describe("s3 storage adapter", () => {
  it("puts bytes with content type and returns the public URL", async () => {
    const captured: Captured[] = [];
    const storage: StoragePort = new S3StorageAdapter(stubClient(captured) as never, {
      bucket: "beim-uploads",
      publicBaseUrl: "https://cdn.example.com"
    });
    const url = await storage.putObject("abc.webp", new Uint8Array([1, 2, 3]), "image/webp");
    expect(captured).toHaveLength(1);
    expect(captured[0].Bucket).toBe("beim-uploads");
    expect(captured[0].Key).toBe("abc.webp");
    expect(captured[0].ContentType).toBe("image/webp");
    expect(url).toBe("https://cdn.example.com/abc.webp");
  });

  it("returns the bare key when no public base URL is configured", async () => {
    const captured: Captured[] = [];
    const storage: StoragePort = new S3StorageAdapter(stubClient(captured) as never, { bucket: "b" });
    await expect(storage.putObject("k", new Uint8Array([9]), "image/png")).resolves.toBe("k");
  });

  it("builds from env only when a bucket is set; secrets never logged", async () => {
    expect(s3StorageFromEnv({}, stubClient([]) as never)).toBeNull();
    const adapter = s3StorageFromEnv(
      { S3_BUCKET: "beim-uploads", S3_SECRET_KEY: "shh" },
      stubClient([]) as never
    );
    expect(adapter).not.toBeNull();
    const captured: Captured[] = [];
    const withCapture = s3StorageFromEnv({ S3_BUCKET: "beim-uploads" }, stubClient(captured) as never)!;
    await withCapture.putObject("k", new Uint8Array([1]), "image/png");
    expect(JSON.stringify(captured)).not.toContain("shh");
  });
});
