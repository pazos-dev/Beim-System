/**
 * Repositorio de auditoría que consume la API backend.
 */

import { HttpClient, type ApiEnvelope } from "./http-client";
import { useAuthStore } from "./auth-store";

export type { ApiEnvelope };

interface BackendAuditEvent {
  readonly id: string;
  readonly action: string;
  readonly actorUserId: string | null;
  readonly actorRole: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly details: unknown;
  readonly createdAt: string;
}

interface BackendAuditListResponse {
  readonly items: readonly BackendAuditEvent[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface AuditEvent {
  readonly id: string;
  readonly actor: string;
  readonly action: string;
  readonly entity: string;
  readonly instant: string;
  readonly result: string;
}

export interface AuditListResponse {
  readonly items: readonly AuditEvent[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface AuditListQuery {
  readonly actor?: string;
  readonly action?: string;
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly limit?: number;
  [key: string]: string | number | undefined;
}

function toAuditEvent(raw: BackendAuditEvent): AuditEvent {
  return {
    id: raw.id,
    actor: raw.actorUserId ?? raw.actorRole ?? "—",
    action: raw.action,
    entity: raw.entityType,
    instant: raw.createdAt,
    result: "ok",
  };
}

/**
 * Client-side repository for the Audit backend API.
 *
 * Authentication is read from the global auth store; the HttpClient turns it
 * into a Bearer header on every request.
 */
export class AuditRepository {
  private readonly client: HttpClient;

  public constructor() {
    this.client = new HttpClient({
      getToken: () => useAuthStore.getState().token,
    });
  }

  public async list(query: AuditListQuery): Promise<ApiEnvelope<AuditListResponse>> {
    const envelope = await this.client.request<BackendAuditListResponse>("GET", "/audit-logs", { query });
    if (!envelope.ok) return { ok: false, error: envelope.error };
    if (envelope.data === undefined) {
      return { ok: false, error: { code: "DEPENDENCY_UNAVAILABLE", message: "Respuesta vacía del servidor" } };
    }
    return {
      ok: true,
      data: {
        items: envelope.data.items.map(toAuditEvent),
        limit: envelope.data.limit,
        page: envelope.data.page,
        total: envelope.data.total,
      },
    };
  }
}

/** Singleton instance used by UI hooks. */
export const auditRepository = new AuditRepository();
