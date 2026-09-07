/**
 * S3-compatible backend for webshop uploads (issue #96, phase 1: proxy).
 *
 * Same public contract as local (uuid filenames, `/api/v1/uploads/<file>`
 * URLs served by the API with Content-Type + nosniff). No signed URLs in
 * this phase: the API proxies bytes so URLs stay stable; signed URLs / CDN
 * are documented as future work in `apps/api/docs/USO.md`.
 *
 * Selection: `S3_BUCKET` set → S3, otherwise local (see `uploads.ts`).
 * Credentials come from env and are never logged.
 */

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { EXTENSION_BY_CONTENT_TYPE, type StoragePort, type StoredObject } from "./storage.js";

export interface S3StorageEnv {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined || raw.trim().length === 0) return undefined;
  return raw.trim();
}

function parseBooleanFlag(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  return raw.trim().toLowerCase() === "true" || raw.trim() === "1" || raw.trim().toLowerCase() === "yes";
}

/** S3 is active when a bucket is configured (non-empty `S3_BUCKET`). */
export function isS3Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEnv(env, "S3_BUCKET") !== undefined;
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3StorageEnv | null {
  const bucket = readEnv(env, "S3_BUCKET");
  if (bucket === undefined) return null;
  return {
    bucket,
    region: readEnv(env, "S3_REGION") ?? "us-east-1",
    endpoint: readEnv(env, "S3_ENDPOINT"),
    forcePathStyle: parseBooleanFlag(readEnv(env, "S3_FORCE_PATH_STYLE")),
    accessKeyId: readEnv(env, "S3_ACCESS_KEY"),
    secretAccessKey: readEnv(env, "S3_SECRET_KEY")
  };
}

export function createS3ClientFromEnv(env: NodeJS.ProcessEnv = process.env): S3Client | null {
  const config = s3ConfigFromEnv(env);
  if (config === null) return null;
  return new S3Client({
    region: config.region,
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    // Omit credentials when unset so the SDK default chain applies;
    // passing half a pair would fail auth with a confusing signature error.
    ...(config.accessKeyId !== undefined && config.secretAccessKey !== undefined
      ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
      : {})
  });
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  const withTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof withTransform.transformToByteArray === "function") {
    return Buffer.from(await withTransform.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

function isMissingKey(error: unknown): boolean {
  const named = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return (
    named?.name === "NoSuchKey" ||
    named?.name === "NotFound" ||
    named?.Code === "NoSuchKey" ||
    named?.Code === "NotFound" ||
    named?.$metadata?.httpStatusCode === 404
  );
}

function fallbackContentType(filename: string): string | undefined {
  const extension = filename.split(".").pop() as string;
  return Object.keys(EXTENSION_BY_CONTENT_TYPE).find(
    (type) => EXTENSION_BY_CONTENT_TYPE[type] === extension
  );
}

/**
 * S3 backend: key == public filename (flat bucket layout, same `uuid.ext`
 * names as local). Put stores the content type; get returns the stored
 * type, falling back to the extension map when S3 omits it.
 */
export class S3Storage implements StoragePort {
  constructor(
    private readonly client: Pick<S3Client, "send">,
    private readonly bucket: string
  ) {}

  async put(filename: string, bytes: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: filename, Body: bytes, ContentType: contentType })
    );
  }

  async get(filename: string): Promise<StoredObject | null> {
    try {
      const output = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: filename }));
      const bytes = await bodyToBuffer(output.Body);
      const contentType =
        typeof output.ContentType === "string" && output.ContentType.length > 0
          ? output.ContentType
          : fallbackContentType(filename);
      if (contentType === undefined) return null;
      return { bytes, contentType };
    } catch (error) {
      if (isMissingKey(error)) return null;
      throw error;
    }
  }
}

/** Null when S3 is not configured; otherwise a ready-to-use backend. */
export function createS3StorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  client?: Pick<S3Client, "send">
): S3Storage | null {
  const config = s3ConfigFromEnv(env);
  if (config === null) return null;
  return new S3Storage(client ?? createS3ClientFromEnv(env)!, config.bucket);
}
