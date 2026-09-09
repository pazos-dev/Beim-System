/**
 * MercadoPago webhook verifier (slice 4.2, change `clean-arch-infrastructure`).
 *
 * DB-free, network-free: pure HMAC-SHA256 over bytes. The edge owns the
 * manifest (`id:<dataId>;request-id:<xRequestId>;ts:<ts>;` — same template as
 * the legacy `verifyWebhookSignature`) because only the edge sees the
 * headers; the adapter owns the secret (`MP_WEBHOOK_SECRET`) and the
 * constant-time comparison. Secrets never reach logs.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { WebhookVerifierPort } from "../../domain/shared/ports.js";

const { MpWebhookVerifier, mpVerifierFromEnv } = await import("./mp-webhook-verifier.js");

const SECRET = "test-webhook-secret-abc123";

function signedManifest(dataId: string, requestId: string, ts: string, secret: string = SECRET) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return { manifest: Buffer.from(manifest, "utf8"), signature: `ts=${ts},v1=${v1}` };
}

describe("mp webhook verifier", () => {
  it("accepts a valid x-signature over the manifest bytes", async () => {
    const verifier: WebhookVerifierPort = new MpWebhookVerifier(SECRET);
    const { manifest, signature } = signedManifest("pay-1", "req-9", "1700000000000");
    expect(verifier.verify(manifest, signature)).toBe(true);
  });

  it("rejects tampered signatures and never throws on malformed input", async () => {
    const verifier = new MpWebhookVerifier(SECRET);
    const { manifest } = signedManifest("pay-1", "req-9", "1700000000000");
    expect(verifier.verify(manifest, "ts=1700000000000,v1=deadbeef")).toBe(false);
    expect(verifier.verify(manifest, "not-a-signature")).toBe(false);
    expect(verifier.verify(manifest, "")).toBe(false);
    expect(verifier.verify(new Uint8Array([]), "ts=1,v1=abc")).toBe(false);
    expect(() => verifier.verify(manifest, "ts=1,v1=abc")).not.toThrow();
  });

  it("rejects everything with an empty secret (fail-closed)", async () => {
    const verifier = new MpWebhookVerifier("");
    const manifest = Buffer.from("id:pay-1;request-id:;ts:1700000000000;", "utf8");
    expect(verifier.verify(manifest, "ts=1700000000000,v1=anything")).toBe(false);
  });

  it("builds from env only with a secret set", async () => {
    expect(mpVerifierFromEnv({})).toBeNull();
    expect(mpVerifierFromEnv({ MP_WEBHOOK_SECRET: "  " })).toBeNull();
    expect(mpVerifierFromEnv({ MP_WEBHOOK_SECRET: SECRET })).not.toBeNull();
  });
});
