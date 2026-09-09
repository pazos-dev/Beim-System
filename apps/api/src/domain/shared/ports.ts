/**
 * Shared base ports (domain slice, change `clean-arch-domain`).
 *
 * Framework-free interfaces only — zero implementations live in `domain/`.
 * `TxClient` is an opaque marker on purpose: the concrete driver type
 * (`pg.PoolClient`) stays in application/infrastructure so `domain/` keeps
 * zero `pg` imports (see the per-slice import scan). Binary bodies use
 * `Uint8Array` (`Buffer` remains assignable at the adapters).
 */
import type { Clock, Uuid } from "./types.js";

export type { Clock, Uuid };

/** Opaque transaction handle. Adapters bridge the real driver client here. */
export interface TxClient {
  readonly __txBrand: "TxClient";
}

/** Transaction boundary for use cases. One aggregate per `run`. */
export interface UnitOfWork {
  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;
}

/** Object-store port (receipt evidence, product images). */
export interface StoragePort {
  putObject(key: string, body: Uint8Array, contentType: string): Promise<string>;
}

/** Payment-provider port (preference mint for webshop checkout). */
export interface PaymentGatewayPort {
  createPreference(orderId: string, amount: number): Promise<{ preferenceId: string }>;
}

/** Webhook-signature verification port (provider callbacks). */
export interface WebhookVerifierPort {
  verify(rawBody: Uint8Array, signature: string): boolean;
}
