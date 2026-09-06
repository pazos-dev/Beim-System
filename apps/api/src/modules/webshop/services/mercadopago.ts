/**
 * MercadoPago HTTP client (issue #84, phase 1 — hand-rolled, no SDK).
 *
 * Secrets and tokens arrive as ARGUMENTS (never imported from config) so
 * this module stays unit-testable without a database or environment.
 * Uses the global fetch with an 8s abort timeout; any transport failure or
 * non-2xx answer surfaces as DependencyUnavailableError (503 at the edge).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { DependencyUnavailableError } from "../../../errors/taxonomy.js";

const MP_API_BASE = "https://api.mercadopago.com";
const MP_FETCH_TIMEOUT_MS = 8000;

export interface WebhookSignatureInput {
  dataId: string;
  xSignature: string;
  xRequestId?: string | null;
  secret: string;
}

/**
 * Verifies the `x-signature` header (`ts=...,v1=...`) over the manifest
 * `id:<dataId>;request-id:<xRequestId>;ts:<ts>;` with HMAC-SHA256 (hex).
 * Malformed input returns false and never throws.
 *
 * No `ts` freshness check on purpose: MercadoPago retries IPN
 * notifications (roughly every 15 minutes) until it gets a 2xx, so a stale
 * `ts` must still verify. Replay protection comes from the webhook_events
 * table idempotency (first insert wins), not from time.
 */
export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  try {
    let ts: string | undefined;
    let v1: string | undefined;
    for (const part of input.xSignature.split(",")) {
      const eq = part.indexOf("=");
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim().toLowerCase();
      const value = part.slice(eq + 1).trim();
      if (key === "ts") ts = value;
      else if (key === "v1") v1 = value;
    }
    if (ts === undefined || ts.length === 0 || v1 === undefined || v1.length === 0) return false;
    if (input.secret.length === 0 || input.dataId.length === 0) return false;
    const manifest = `id:${input.dataId};request-id:${input.xRequestId ?? ""};ts:${ts};`;
    const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(v1.toLowerCase(), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface MpPayment {
  id: number | string;
  status: string;
  /** Our order id echoed back; null when the payment carries none. */
  external_reference: string | null;
}

export async function getPayment(accessToken: string, paymentId: string): Promise<MpPayment> {
  let res: Response;
  try {
    res = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(MP_FETCH_TIMEOUT_MS)
    });
  } catch {
    throw new DependencyUnavailableError();
  }
  if (!res.ok) throw new DependencyUnavailableError();
  const body = (await res.json()) as { id?: unknown; status?: unknown; external_reference?: unknown };
  return {
    id: typeof body.id === "number" || typeof body.id === "string" ? body.id : paymentId,
    status: typeof body.status === "string" ? body.status : "",
    external_reference: typeof body.external_reference === "string" ? body.external_reference : null
  };
}

export interface MpPreferenceItem {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: string;
}

export interface MpPreferenceResult {
  id: string;
  init_point: string;
}

export async function createPreference(
  accessToken: string,
  input: { items: MpPreferenceItem[]; externalReference: string; notificationUrl?: string }
): Promise<MpPreferenceResult> {
  const body: Record<string, unknown> = {
    items: input.items,
    external_reference: input.externalReference
  };
  if (input.notificationUrl !== undefined) body.notification_url = input.notificationUrl;
  let res: Response;
  try {
    res = await fetch(`${MP_API_BASE}/checkout/preferences`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MP_FETCH_TIMEOUT_MS)
    });
  } catch {
    throw new DependencyUnavailableError();
  }
  if (!res.ok) throw new DependencyUnavailableError();
  const parsed = (await res.json()) as { id?: unknown; init_point?: unknown };
  if (typeof parsed.id !== "string" || typeof parsed.init_point !== "string") {
    throw new DependencyUnavailableError();
  }
  return { id: parsed.id, init_point: parsed.init_point };
}
