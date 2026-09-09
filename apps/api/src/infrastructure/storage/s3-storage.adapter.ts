import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StoragePort } from "../../domain/shared/ports.js";

/**
 * S3 object-store client (slice 4.2, change `clean-arch-infrastructure`).
 *
 * Driven adapter behind the domain `StoragePort` — the ONLY place the
 * AWS SDK is imported (see the gate SDK scan). The wire client is
 * injected (`Pick<S3Client, "send">`) so tests stub it with zero
 * network; credentials come from env at the composition root and are
 * never logged. Returns the public URL when a base is configured,
 * else the bare key (same contract as the legacy proxy URLs).
 */
export interface S3StorageConfig {
  bucket: string;
  publicBaseUrl?: string;
}

export class S3StorageAdapter implements StoragePort {
  constructor(
    private readonly client: Pick<S3Client, "send">,
    private readonly config: S3StorageConfig
  ) {}

  async putObject(key: string, body: Uint8Array, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType })
    );
    return this.config.publicBaseUrl !== undefined ? `${this.config.publicBaseUrl}/${key}` : key;
  }
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  return raw === undefined || raw.trim().length === 0 ? undefined : raw.trim();
}

/** Null when S3 is not configured (no `S3_BUCKET`); secrets stay in env. */
export function s3StorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  client?: Pick<S3Client, "send">
): S3StorageAdapter | null {
  const bucket = readEnv(env, "S3_BUCKET");
  if (bucket === undefined) return null;
  if (client === undefined) return null;
  return new S3StorageAdapter(client, { bucket, publicBaseUrl: readEnv(env, "S3_PUBLIC_BASE_URL") });
}
