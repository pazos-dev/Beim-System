/**
 * Audit-trail read handler (gap-slice G2b, closes G2).
 *
 * Thin composition over the audit read port only: the handler never touches
 * `UnitOfWork.run` and never remaps errors — failures bubble so the edge
 * `toAppError` propagates the catalog code + status. The only policy owned
 * here is the pagination clamp (page default 1, limit default 20, max 100),
 * mirroring the legacy `clampPagination` + `auditLogsService.list` contract.
 * Framework-free: zero `express`/`pg`/`zod` imports.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface AuditLogsQuery {
  readonly action?: string;
  readonly actorUserId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly limit?: number;
}

/** Driven port; the infrastructure adapter owns SQL at cutover. */
export interface AuditReader {
  listAudits(query: AuditLogsQuery): Promise<unknown>;
}

function clampPage(page?: number): number {
  if (page === undefined) return DEFAULT_PAGE;
  return Math.max(DEFAULT_PAGE, Math.trunc(page));
}

function clampLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function makeAuditHandlers(reader: AuditReader) {
  return {
    listAudits: (query: AuditLogsQuery): Promise<unknown> =>
      reader.listAudits({ ...query, page: clampPage(query.page), limit: clampLimit(query.limit) })
  };
}
