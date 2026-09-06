/**
 * Postgres AuditLogsPort (PR 3).
 *
 * Generic journal used by the stock-movements endpoint (action
 * 'stock.movement', entity_type 'product', entity_id = product id, details
 * carry { quantity, movementType, detail }) and by cash-session movements
 * (the cash-sessions repository uses its own gated insert). `list` supports
 * the filters needed by the stock-movements list (product, date range).
 */
import { query } from "../../../config/db.js";
import type { AuditLogRow, AuditLogsPort } from "../ports.js";

interface AuditRow {
  id: string; // bigserial → string
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  created_at: Date;
}

function mapAuditRow(row: AuditRow): AuditLogRow {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: row.details as AuditLogRow["details"],
    createdAt: row.created_at
  };
}

export const auditLogsRepository: AuditLogsPort = {
  async insert(input) {
    const { rows } = await query<AuditRow>(
      `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at`,
      [
        input.actorUserId ?? null,
        input.actorRole ?? null,
        input.action,
        input.entityType,
        input.entityId ?? null,
        JSON.stringify(input.details ?? {})
      ]
    );
    return mapAuditRow(rows[0]);
  },

  async list(filter) {
    const { rows } = await query<AuditRow>(
      `SELECT id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at
       FROM audit_logs
       WHERE ($1::text IS NULL OR action = $1)
         AND ($2::text IS NULL OR entity_type = $2)
         AND ($3::text IS NULL OR entity_id = $3)
         AND ($4::date IS NULL OR created_at::date >= $4)
         AND ($5::date IS NULL OR created_at::date <= $5)
       ORDER BY id DESC`,
      [
        filter.action ?? null,
        filter.entityType ?? null,
        filter.entityId ?? null,
        filter.from ?? null,
        filter.to ?? null
      ]
    );
    return rows.map(mapAuditRow);
  }
};