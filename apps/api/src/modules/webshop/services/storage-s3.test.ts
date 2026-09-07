/**
 * S3 backend unit tests (issue #96) — DB-free, no network.
 *
 * The S3 path is verified with a stubbed `S3Client.send` (no MinIO/docker
 * locally): Put asserts bucket/key/content-type, Get returns bytes, and
 * NoSuchKey maps to null. Env parsing (defaults + path-style flag) is
 * covered alongside.
 */
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  S3Storage,
  createS3StorageFromEnv,
  isS3Enabled,
  s3ConfigFromEnv
} from "./storage-s3.js";

type SendStub = Pick<S3Client, "send">;

function stubClient(handler: (command: unknown) => Promise<unknown>): SendStub {
  return { send: ((command: unknown) => handler(command)) as SendStub["send"] };
}

const FILENAME = "123e4567-e89b-12d3-a456-426614174000.png";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("S3Storage.put", () => {
  it("sends bucket, key, body and content type", async () => {
    const seen: unknown[] = [];
    const client = stubClient(async (command) => {
      seen.push(command);
      return {};
    });
    await new S3Storage(client, "beim-uploads").put(FILENAME, PNG, "image/png");

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(PutObjectCommand);
    expect((seen[0] as PutObjectCommand).input).toMatchObject({
      Bucket: "beim-uploads",
      Key: FILENAME,
      ContentType: "image/png"
    });
    expect((seen[0] as PutObjectCommand).input.Body).toEqual(PNG);
  });
});

describe("S3Storage.get", () => {
  it("returns S3 bytes with the stored content type", async () => {
    const client = stubClient(async (command) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect((command as GetObjectCommand).input).toMatchObject({
        Bucket: "beim-uploads",
        Key: FILENAME
      });
      return {
        Body: { transformToByteArray: async () => new Uint8Array(PNG) },
        ContentType: "image/png"
      };
    });
    const loaded = await new S3Storage(client, "beim-uploads").get(FILENAME);
    expect(loaded?.bytes).toEqual(PNG);
    expect(loaded?.contentType).toBe("image/png");
  });

  it("collects a plain stream body without transformToByteArray", async () => {
    const client = stubClient(async () => ({
      Body: Readable.from([PNG.subarray(0, 4), PNG.subarray(4)]),
      ContentType: "image/png"
    }));
    const loaded = await new S3Storage(client, "beim-uploads").get(FILENAME);
    expect(loaded?.bytes).toEqual(PNG);
  });

  it("maps NoSuchKey to null", async () => {
    const missing = Object.assign(new Error("missing"), { name: "NoSuchKey" });
    const client = stubClient(async () => {
      throw missing;
    });
    await expect(new S3Storage(client, "beim-uploads").get(FILENAME)).resolves.toBeNull();
  });

  it("falls back to the extension map when S3 omits the content type", async () => {
    const client = stubClient(async () => ({
      Body: { transformToByteArray: async () => new Uint8Array(PNG) }
    }));
    const loaded = await new S3Storage(client, "beim-uploads").get(FILENAME);
    expect(loaded?.contentType).toBe("image/png");
  });

  it("rethrows non-missing errors", async () => {
    const client = stubClient(async () => {
      throw new Error("boom");
    });
    await expect(new S3Storage(client, "beim-uploads").get(FILENAME)).rejects.toThrow("boom");
  });
});

describe("S3 env selection", () => {
  it("is disabled without S3_BUCKET", () => {
    expect(isS3Enabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isS3Enabled({ S3_BUCKET: "  " } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(s3ConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(createS3StorageFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("defaults region to us-east-1 with path style off", () => {
    const config = s3ConfigFromEnv({ S3_BUCKET: "beim-uploads" } as unknown as NodeJS.ProcessEnv);
    expect(config).toMatchObject({ bucket: "beim-uploads", region: "us-east-1", forcePathStyle: false });
    expect(config?.endpoint).toBeUndefined();
  });

  it("parses endpoint, region, credentials and the MinIO path-style flag", () => {
    const config = s3ConfigFromEnv({
      S3_BUCKET: "beim-uploads",
      S3_REGION: "sa-east-1",
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY: "minio",
      S3_SECRET_KEY: "minio123",
      S3_FORCE_PATH_STYLE: "true"
    } as unknown as NodeJS.ProcessEnv);
    expect(config).toMatchObject({
      bucket: "beim-uploads",
      region: "sa-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
      accessKeyId: "minio",
      secretAccessKey: "minio123"
    });
  });
});
