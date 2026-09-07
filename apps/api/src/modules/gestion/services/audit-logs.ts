/**
 * Audit-trail read service (issue #97).
 *
 * Thin over the repository: clamps pagination (page default 1, limit default
 * 20, max 100 — same contract as the receipts/users lists) and returns the
 * public row shape (ids + actions only, no PII beyond what the journal
 * already stores).
 */
import type { AuditLogRow } from "../ports.js";
import { auditLogsRepository } from "../repositories/pg-audit-logs.js";

export interface AuditLogsQuery {
  action?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogsPage {
  items: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export const auditLogsService = {
  list(filter: AuditLogsQuery = {}): Promise<AuditLogsPage> {
    return auditLogsRepository.listPaged({
      action: filter.action,
      actorUserId: filter.actorUserId,
      from: filter.from,
      to: filter.to,
      page: filter.page,
      limit: filter.limit
    });
  }
};
