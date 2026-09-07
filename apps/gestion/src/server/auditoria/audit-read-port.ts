import type { AuditEvent, GestionError } from "../data/schemas";
import type { Result } from "../shared/result";

/**
 * Filters for reading audit records. Field names follow the gestion domain
 * (actorId/action); the HTTP adapter maps them to the API contract
 * (actor/action) so callers never depend on the remote naming.
 */
export interface AuditReadFilters {
  /** Exact match on the actor id (gestion actorId, API actor). */
  actorId?: string;
  /** Exact match on the action name (gestion accion, API action). */
  action?: string;
  /** Inclusive lower bound, UTC ISO-8601 instant. */
  from?: string;
  /** Inclusive upper bound, UTC ISO-8601 instant. */
  to?: string;
  /** 1-based page, defaults to 1. */
  page?: number;
  /** Page size, defaults to the adapter default (JSON returns all). */
  limit?: number;
}

export interface AuditReadPage {
  items: AuditEvent[];
  /** Total matching records before pagination. */
  total: number;
}

/**
 * Read-only port for audit records (ISP: list only, no append/write).
 * Implemented by JsonAuditReadRepository (local default) and
 * HttpAuditRepository (env-gated remote). Both are substitutable (LSP).
 */
export interface AuditReadPort {
  list(filters: AuditReadFilters): Promise<Result<AuditReadPage, GestionError>>;
}
