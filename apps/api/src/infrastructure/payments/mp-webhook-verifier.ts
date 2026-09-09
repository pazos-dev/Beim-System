import { createHmac, timingSafeEqual } from "node:crypto";

import type { WebhookVerifierPort } from "../../domain/shared/ports.js";

/**
 * MercadoPago webhook verifier (slice 4.2, change `clean-arch-infrastructure`).
 *
 * Driven adapter behind the domain `WebhookVerifierPort` — the ONLY place
 * the MP webhook secret is held (see the gate SDK scan). Split of the legacy
 * `verifyWebhookSignature` (`src/modules/webshop/services/mercadopago.ts`):
 * the edge owns the manifest because only it sees the headers, so callers
 * pass the manifest bytes (`id:<dataId>;request-id:<xRequestId>;ts:<ts>;`)
 * as `rawBody` plus the raw `x-signature` header (`ts=...,v1=...`) as
 * `signature`. This adapter owns the HMAC-SHA256 (hex) check with
 * `timingSafeEqual`. Malformed input returns false and never throws
 * (fail-closed); the secret comes from env and is never logged.
 */
export class MpWebhookVerifier implements WebhookVerifierPort {
  constructor(private readonly secret: string) {}

  verify(rawBody: Uint8Array, signature: string): boolean {
    try {
      if (this.secret.length === 0 || rawBody.length === 0) return false;
      const { ts, v1 } = parseXSignature(signature);
      if (ts === null || v1 === null) return false;
      void ts;
      const expected = createHmac("sha256", this.secret).update(rawBody).digest("hex");
      const a = Buffer.from(expected, "utf8");
      const b = Buffer.from(v1.toLowerCase(), "utf8");
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

function parseXSignature(signature: string): { ts: string | null; v1: string | null } {
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of signature.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (value.length === 0) continue;
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  return { ts, v1 };
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  return raw === undefined || raw.trim().length === 0 ? undefined : raw.trim();
}

/** Null when MP webhooks are not configured (no `MP_WEBHOOK_SECRET`). */
export function mpVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): MpWebhookVerifier | null {
  const secret = readEnv(env, "MP_WEBHOOK_SECRET");
  if (secret === undefined) return null;
  return new MpWebhookVerifier(secret);
}
