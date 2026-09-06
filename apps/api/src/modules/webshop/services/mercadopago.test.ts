/**
 * MercadoPago webhook signature unit tests (issue #84) — DB-free.
 *
 * Vectors are deterministic: signatures are computed with the same manifest
 * (`id:<dataId>;request-id:<xRequestId>;ts:<ts>;`) and HMAC-SHA256 algorithm
 * the verifier implements, under a fixed test secret.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "./mercadopago.js";

const SECRET = "test-webhook-secret-abc123";
const DATA_ID = "987654321";
const REQUEST_ID = "req-abc-123";
const TS = "1704908010";

function sign(dataId: string, xRequestId: string | undefined, ts: string, secret = SECRET): string {
  const manifest = `id:${dataId};request-id:${xRequestId ?? ""};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature with x-request-id", () => {
    expect(
      verifyWebhookSignature({ dataId: DATA_ID, xSignature: sign(DATA_ID, REQUEST_ID, TS), xRequestId: REQUEST_ID, secret: SECRET })
    ).toBe(true);
  });

  it("accepts a valid signature without x-request-id", () => {
    expect(
      verifyWebhookSignature({ dataId: DATA_ID, xSignature: sign(DATA_ID, undefined, TS), secret: SECRET })
    ).toBe(true);
  });

  it("rejects a tampered v1", () => {
    const header = sign(DATA_ID, REQUEST_ID, TS).replace(/v1=./, "v1=0");
    expect(
      verifyWebhookSignature({ dataId: DATA_ID, xSignature: header, xRequestId: REQUEST_ID, secret: SECRET })
    ).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(
      verifyWebhookSignature({
        dataId: DATA_ID,
        xSignature: sign(DATA_ID, REQUEST_ID, TS, "other-secret"),
        xRequestId: REQUEST_ID,
        secret: SECRET
      })
    ).toBe(false);
  });

  it("rejects a signature bound to another data id", () => {
    expect(
      verifyWebhookSignature({
        dataId: "111111111",
        xSignature: sign(DATA_ID, REQUEST_ID, TS),
        xRequestId: REQUEST_ID,
        secret: SECRET
      })
    ).toBe(false);
  });

  it("rejects malformed headers without throwing", () => {
    const malformed = ["", "basura", "ts=1704908010", "v1=abc123", "ts=,v1=", "foo=bar,baz=qux", "ts=1704908010,v1=zzz"];
    for (const xSignature of malformed) {
      expect(verifyWebhookSignature({ dataId: DATA_ID, xSignature, xRequestId: REQUEST_ID, secret: SECRET })).toBe(false);
    }
  });

  it("rejects empty secret or data id without throwing", () => {
    expect(
      verifyWebhookSignature({ dataId: DATA_ID, xSignature: sign(DATA_ID, REQUEST_ID, TS, ""), xRequestId: REQUEST_ID, secret: "" })
    ).toBe(false);
    expect(
      verifyWebhookSignature({ dataId: "", xSignature: sign("", REQUEST_ID, TS), xRequestId: REQUEST_ID, secret: SECRET })
    ).toBe(false);
  });
});
