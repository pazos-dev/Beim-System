import {
  auditEventSchema,
  type AuditEvent,
  type GestionError
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import type {
  AuditReadFilters,
  AuditReadPage,
  AuditReadPort
} from "./audit-read-port";

/** Minimal fetch surface (ISP): only what the repository needs, mockable. */
export interface AuditHttpFetch {
  (url: string, init: { headers: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export interface HttpAuditRepositoryConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: AuditHttpFetch;
}

function defaultFetch(url: string, init: { headers: Record<string, string> }) {
  return fetch(url, { headers: init.headers });
}

/**
 * Map one remote audit item to the gestion shape.
 * Remote fields: actorUserId (uuid|null) -> actorId; action -> accion.
 * Accepts gestion names as fallback so mixed payloads still validate.
 * Returns null when the item cannot satisfy the gestion audit schema.
 * Never logs the item (no PII in logs).
 */
export function toGestionAuditEvent(raw: unknown): AuditEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const parsed = auditEventSchema.safeParse({
    id: item.id,
    actorId: item.actorId ?? item.actorUserId ?? null,
    accion: item.accion ?? item.action,
    entidad: item.entidad ?? item.entity ?? "audit",
    entidadId: item.entidadId ?? item.entityId ?? null,
    instante: item.instante ?? item.timestamp ?? item.createdAt ?? item.at,
    resultado: item.resultado ?? item.result ?? "ok",
    detalles: item.detalles ?? item.details ?? {}
  });
  return parsed.success ? parsed.data : null;
}

function isEnvelopeWithPage(raw: unknown): raw is {
  ok: boolean;
  data: { items: unknown; total: unknown };
} {
  if (typeof raw !== "object" || raw === null) return false;
  const body = raw as { ok?: unknown; data?: unknown };
  if (body.ok !== true || typeof body.data !== "object" || body.data === null) return false;
  const data = body.data as { items?: unknown; total?: unknown };
  return Array.isArray(data.items) && typeof data.total === "number";
}

/**
 * Remote audit reader behind AuditReadPort (DIP: callers depend on the port).
 * Bearer token travels only in the Authorization header, taken from config
 * (wired from BEIM_API_TOKEN by the factory); nothing sensitive is logged.
 */
export class HttpAuditRepository implements AuditReadPort {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: AuditHttpFetch;

  public constructor(config: HttpAuditRepositoryConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
  }

  public async list(filters: AuditReadFilters): Promise<Result<AuditReadPage, GestionError>> {
    const query = new URLSearchParams();
    if (filters.actorId !== undefined) query.set("actor", filters.actorId);
    if (filters.action !== undefined) query.set("action", filters.action);
    if (filters.from !== undefined) query.set("from", filters.from);
    if (filters.to !== undefined) query.set("to", filters.to);
    if (filters.page !== undefined) query.set("page", String(filters.page));
    if (filters.limit !== undefined) query.set("limit", String(filters.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";

    let response: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1/audit-logs${suffix}`, {
        headers: { Authorization: `Bearer ${this.token}` }
      });
    } catch {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    if (response.status === 401) {
      return err(createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED));
    }
    // Live API contract (verified 2026-09-07): missing or unknown Bearer
    // identity answers 404 instead of 401 on this collection endpoint.
    if (response.status === 404) {
      return err(createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED));
    }
    // Authenticated but not admin: honest forbidden, still fail-closed.
    if (response.status === 403) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    if (!response.ok) {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }
    if (!isEnvelopeWithPage(body)) {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    const items: AuditEvent[] = [];
    for (const raw of body.data.items as unknown[]) {
      const mapped = toGestionAuditEvent(raw);
      if (mapped === null) {
        return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
      }
      items.push(mapped);
    }
    return ok({ items, total: body.data.total as number });
  }
}
