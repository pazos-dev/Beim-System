import type { PaymentGatewayPort } from "../../domain/shared/ports.js";
import { DependencyUnavailableError } from "../../errors/taxonomy.js";

/**
 * MercadoPago preference gateway (slice 4.2, change `clean-arch-infrastructure`).
 *
 * Driven adapter behind the domain `PaymentGatewayPort` — hand-rolled HTTP
 * (same as the legacy client), so no MP SDK import exists anywhere (see the
 * gate SDK scan). The use case passes the server-priced total, which the
 * adapter projects as one line-item with `external_reference` set to the
 * order id for reconciliation; catalog detail stays server-side (same shape
 * as the legacy `createPreferenceForOrder` items mapping). `fetch` is
 * injected so tests stub it with zero network; the 8s abort timeout matches
 * the legacy client. Transport faults, non-2xx answers, and malformed ids
 * surface as `DependencyUnavailableError` (503 at the edge). The token comes
 * from env, travels only as an `Authorization` header, and is never logged.
 */
const MP_API_BASE = "https://api.mercadopago.com";
const MP_FETCH_TIMEOUT_MS = 8000;

export interface MpFetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export interface MpFetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export type MpFetch = (url: string, init: MpFetchInit) => Promise<MpFetchResponse>;

export interface MpPreferenceConfig {
  accessToken: string;
  notificationUrl?: string;
  currencyId?: string;
}

export class MpPreferenceGateway implements PaymentGatewayPort {
  constructor(
    private readonly fetchImpl: MpFetch,
    private readonly config: MpPreferenceConfig
  ) {}

  async createPreference(orderId: string, amount: number): Promise<{ preferenceId: string }> {
    const body: Record<string, unknown> = {
      items: [
        {
          title: orderId,
          quantity: 1,
          unit_price: amount,
          currency_id: this.config.currencyId ?? "UYU"
        }
      ],
      external_reference: orderId
    };
    if (this.config.notificationUrl !== undefined) body.notification_url = this.config.notificationUrl;
    let res: MpFetchResponse;
    try {
      res = await this.fetchImpl(`${MP_API_BASE}/checkout/preferences`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(MP_FETCH_TIMEOUT_MS)
      });
    } catch {
      throw new DependencyUnavailableError();
    }
    if (!res.ok) throw new DependencyUnavailableError();
    const parsed = (await res.json()) as { id?: unknown };
    if (typeof parsed.id !== "string" || parsed.id.length === 0) throw new DependencyUnavailableError();
    return { preferenceId: parsed.id };
  }
}

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  return raw === undefined || raw.trim().length === 0 ? undefined : raw.trim();
}

/** Null when MP is not configured (no `MP_ACCESS_TOKEN`); secrets stay in env. */
export function mpPreferenceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: MpFetch = globalThis.fetch as unknown as MpFetch
): MpPreferenceGateway | null {
  const accessToken = readEnv(env, "MP_ACCESS_TOKEN");
  if (accessToken === undefined) return null;
  return new MpPreferenceGateway(fetchImpl, {
    accessToken,
    notificationUrl: readEnv(env, "MP_NOTIFICATION_URL"),
    currencyId: readEnv(env, "MP_CURRENCY_ID")
  });
}
