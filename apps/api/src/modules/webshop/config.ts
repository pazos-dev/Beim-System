/**
 * Webshop module configuration (PR 4).
 *
 * Read lazily per call (not at module load) so tests can point UPLOADS_DIR at
 * a temporary directory and change limits between requests without import
 * ordering constraints. All values have safe defaults.
 */
import { z } from "zod";

const WEBSHOP_ENV_SCHEMA = z.object({
  /** Directory where validated image uploads are stored on disk. */
  UPLOADS_DIR: z.string().min(1).default("uploads"),
  /** Upload size cap in bytes (server-side, spec: "size"). */
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  /** Base URL used to build checkout-session payment URLs. */
  CHECKOUT_BASE_URL: z.string().min(1).default("http://localhost:4000"),
  /** Web session lifetime in days (token hash + expiry). */
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Checkout session lifetime in minutes (payment stays unpaid until webhook). */
  CHECKOUT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  /** MercadoPago access token (server-side; required only to mint preferences / fetch payments). */
  MP_ACCESS_TOKEN: z.string().optional(),
  /** MercadoPago webhook signing secret (required only to verify IPN signatures). */
  MP_WEBHOOK_SECRET: z.string().optional(),
  /** Public URL MercadoPago calls back on (sent as preference notification_url). */
  MP_NOTIFICATION_URL: z.string().optional()
});

export interface WebshopConfig {
  uploadsDir: string;
  maxUploadBytes: number;
  checkoutBaseUrl: string;
  sessionTtlMs: number;
  checkoutSessionTtlMs: number;
  mpAccessToken?: string;
  mpWebhookSecret?: string;
  mpNotificationUrl?: string;
}

export function webshopConfig(env: NodeJS.ProcessEnv = process.env): WebshopConfig {
  const parsed = WEBSHOP_ENV_SCHEMA.parse(env);
  return {
    uploadsDir: parsed.UPLOADS_DIR,
    maxUploadBytes: parsed.MAX_UPLOAD_BYTES,
    checkoutBaseUrl: parsed.CHECKOUT_BASE_URL,
    sessionTtlMs: parsed.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    checkoutSessionTtlMs: parsed.CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000,
    // Empty strings count as unset so a `VAR=` line never passes auth checks.
    mpAccessToken: parsed.MP_ACCESS_TOKEN || undefined,
    mpWebhookSecret: parsed.MP_WEBHOOK_SECRET || undefined,
    mpNotificationUrl: parsed.MP_NOTIFICATION_URL || undefined
  };
}