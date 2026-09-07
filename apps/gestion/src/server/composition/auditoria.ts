import type { AuditReadPort } from "../auditoria/audit-read-port";
import { HttpAuditRepository } from "../auditoria/http-audit-repository";
import { JsonAuditReadRepository } from "../auditoria/json-audit-read-repository";

export const AUDIT_API_ENV = {
  baseUrl: "BEIM_API_BASE_URL",
  token: "BEIM_API_TOKEN"
} as const;

export const DEFAULT_AUDIT_API_BASE_URL = "http://localhost:4000";

/** True only when both remote settings are present (safe rollout gate). */
export function isAuditHttpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[AUDIT_API_ENV.baseUrl]) && Boolean(env[AUDIT_API_ENV.token]);
}

/**
 * Env-gated wiring for the audit reader.
 * Default (no env): existing Json behavior, unchanged.
 * With BEIM_API_BASE_URL + BEIM_API_TOKEN: remote HttpAuditRepository.
 * Never falls back silently mid-read; the choice is made once here.
 */
export function createAuditReadPort(
  dataDirectory: string,
  env: NodeJS.ProcessEnv = process.env
): AuditReadPort {
  const baseUrl = env[AUDIT_API_ENV.baseUrl];
  const token = env[AUDIT_API_ENV.token];
  if (baseUrl !== undefined && baseUrl.length > 0 && token !== undefined && token.length > 0) {
    return new HttpAuditRepository({ baseUrl, token });
  }
  return new JsonAuditReadRepository(dataDirectory);
}
