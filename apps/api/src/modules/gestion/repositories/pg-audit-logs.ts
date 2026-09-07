/**
 * Postgres AuditLogsPort (PR 3, issue #97 read + journal completion).
 *
 * Generic journal for stock movements (action 'stock.movement'), cash-session
 * movements ('cash.movement'), purchases ('purchase.create') and the issue-#97
 * journals (sales, annuls, paid orders, auth, user admin, uploads). `insert`
 * accepts an optional TxClient so journals join the caller's transaction.
 * `list` serves the stock-movements list; `listPaged` serves the admin
 * audit-trail read (actor/action/date filters, newest first).
 */
import { query } from "../../../config/db.js";
import type { TxClient } from "../../../db/withTransaction.js";
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

const SELECT_COLUMNS =
  "id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at";

/** actor_user_id is uuid-typed: non-uuid caller ids (test doubles) become null. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeAuditActor(userId: string | null | undefined): string | null {
  return userId !== undefined && userId !== null && UUID_RE.test(userId) ? userId : null;
}

export const auditLogsRepository: AuditLogsPort = {
  async insert(input, client?: TxClient) {
    // FK-safe actor: actor_user_id references users(id), but console
    // identities (gestion_users) and test doubles have no row there. The
    // LEFT JOIN resolves unknown ids to null instead of violating the FK —
    // the role (actor_role) is always preserved.
    const text = `INSERT INTO audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details)
           SELECT u.id, $2::text, $3, $4, $5, $6::jsonb
           FROM (SELECT $1::uuid AS id) AS a LEFT JOIN users u ON u.id = a.id
           RETURNING ${SELECT_COLUMNS}`;
    const params: unknown[] = [
      normalizeAuditActor(input.actorUserId ?? null),
      input.actorRole ?? null,
      input.action,
      input.entityType,
      input.entityId ?? null,
      JSON.stringify(input.details ?? {})
    ];
    const { rows } =
      client !== undefined ? await client.query<AuditRow>(text, params) : await query<AuditRow>(text, params);
    return mapAuditRow(rows[0]);
  },

  async list(filter) {
    const { rows } = await query<AuditRow>(
      `SELECT ${SELECT_COLUMNS}
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
  },

  async listPaged(filter) {
    const page = Math.max(filter.page ?? 1, 1);
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = (page - 1) * limit;
    const where = `WHERE ($1::text IS NULL OR action = $1)
         AND ($2::uuid IS NULL OR actor_user_id = $2)
         AND ($3::date IS NULL OR created_at::date >= $3)
         AND ($4::date IS NULL OR created_at::date <= $4)`;
    const params: unknown[] = [
      filter.action ?? null,
      filter.actorUserId ?? null,
      filter.from ?? null,
      filter.to ?? null
    ];
    const { rows } = await query<AuditRow>(
      `SELECT ${SELECT_COLUMNS} FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`,
      [...params, limit, offset]
    );
    const { rows: countRows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_logs ${where}`,
      params
    );
    return {
      items: rows.map(mapAuditRow),
      total: Number(countRows[0].n),
      page,
      limit
    };
  }
};
