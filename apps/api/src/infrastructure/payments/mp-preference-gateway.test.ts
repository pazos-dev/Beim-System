/**
 * MercadoPago preference gateway (slice 4.2, change `clean-arch-infrastructure`).
 *
 * DB-free, network-free: `fetch` is injected so the stub below captures the
 * request and answers without touching the network. The access token arrives
 * only via env (`MP_ACCESS_TOKEN`), travels solely as an `Authorization`
 * header, and is never logged.
 */
import { describe, expect, it } from "vitest";

import type { PaymentGatewayPort } from "../../domain/shared/ports.js";
import { DependencyUnavailableError } from "../../errors/taxonomy.js";

const { MpPreferenceGateway, mpPreferenceFromEnv } = await import("./mp-preference-gateway.js");

interface CapturedRequest {
  url: string;
  init: { method: string; headers: Record<string, string>; body: string };
}

function stubFetch(captured: CapturedRequest[], answer: unknown, ok = true) {
  return async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    captured.push({ url, init });
    return { ok, async json(): Promise<unknown> { return answer; } };
  };
}

describe("mp preference gateway", () => {
  it("posts one priced line-item with external reference and returns the preference id", async () => {
    const captured: CapturedRequest[] = [];
    const gateway: PaymentGatewayPort = new MpPreferenceGateway(
      stubFetch(captured, { id: "pref-123", init_point: "https://mp.test/init" }) as never,
      { accessToken: "TEST-TOKEN", notificationUrl: "https://api.test/webhooks/mercadopago" }
    );
    await expect(gateway.createPreference("order-1", 1500)).resolves.toEqual({ preferenceId: "pref-123" });
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.mercadopago.com/checkout/preferences");
    expect(captured[0].init.method).toBe("POST");
    expect(captured[0].init.headers.Authorization).toBe("Bearer TEST-TOKEN");
    const body = JSON.parse(captured[0].init.body) as {
      items: { title: string; quantity: number; unit_price: number; currency_id: string }[];
      external_reference: string;
      notification_url: string;
    };
    expect(body.items).toEqual([{ title: "order-1", quantity: 1, unit_price: 1500, currency_id: "UYU" }]);
    expect(body.external_reference).toBe("order-1");
    expect(body.notification_url).toBe("https://api.test/webhooks/mercadopago");
  });

  it("omits notification_url when none is configured", async () => {
    const captured: CapturedRequest[] = [];
    const gateway = new MpPreferenceGateway(
      stubFetch(captured, { id: "pref-9", init_point: "https://mp.test/i" }) as never,
      { accessToken: "TEST-TOKEN" }
    );
    await gateway.createPreference("order-2", 200);
    expect(captured[0].init.body).not.toContain("notification_url");
  });

  it("fails closed with DependencyUnavailableError on non-2xx, transport faults, and malformed ids", async () => {
    const non2xx = new MpPreferenceGateway(
      stubFetch([], { error: "bad" }, false) as never,
      { accessToken: "TEST-TOKEN" }
    );
    await expect(non2xx.createPreference("order-1", 100)).rejects.toBeInstanceOf(DependencyUnavailableError);
    const transport = new MpPreferenceGateway(
      (async () => { throw new Error("boom"); }) as never,
      { accessToken: "TEST-TOKEN" }
    );
    await expect(transport.createPreference("order-1", 100)).rejects.toBeInstanceOf(DependencyUnavailableError);
    const malformed = new MpPreferenceGateway(
      stubFetch([], { init_point: "https://mp.test/i" }) as never,
      { accessToken: "TEST-TOKEN" }
    );
    await expect(malformed.createPreference("order-1", 100)).rejects.toBeInstanceOf(DependencyUnavailableError);
  });

  it("builds from env only with a token; the token never lands in the JSON body", async () => {
    expect(mpPreferenceFromEnv({})).toBeNull();
    const captured: CapturedRequest[] = [];
    const gateway = mpPreferenceFromEnv(
      { MP_ACCESS_TOKEN: "TEST-TOKEN", MP_NOTIFICATION_URL: "https://api.test/wh" },
      stubFetch(captured, { id: "pref-env", init_point: "https://mp.test/i" }) as never
    )!;
    expect(gateway).not.toBeNull();
    await gateway.createPreference("order-7", 50);
    expect(captured[0].init.body).not.toContain("TEST-TOKEN");
    expect(captured[0].init.headers.Authorization).toBe("Bearer TEST-TOKEN");
  });
});
