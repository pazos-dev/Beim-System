/**
 * Postgres CashSessionsPort (PR 3).
 *
 * Atomic gated primitives: `create` inserts ONLY when no session is open AND
 * the business date is free (single statement, no TOCTOU); `close` flips only
 * open sessions; `recordMovement` journals into audit_logs (action
 * 'cash.movement') ONLY while the session is still open. The service layer
 * translates null returns into 409/404 semantics.
 */
import { query } from "../../../config/db.js";
import { ConflictError } from "../../../errors/taxonomy.js";
import type { AuditLogRow, CashSessionRow, CashSessionsPort } from "../ports.js";

interface SessionRow {
  id: string;
  business_date: Date; // DATE
  opening_amount: string;
  expected_amount: string;
  counted_amount: string | null;
  difference: string;
  status: string;
  notes: string;
  opened_at: Date;
  closed_at: Date | null;
}

function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mapSessionRow(row: SessionRow): CashSessionRow {
  return {
    id: row.id,
    businessDate: formatLocalDate(row.business_date),
    openingAmount: Number(row.opening_amount),
    expectedAmount: Number(row.expected_amount),
    countedAmount: row.counted_amount === null ? null : Number(row.counted_amount),
    difference: Number(row.difference),
    status: row.status,
    notes: row.notes,
    openedAt: row.opened_at,
    closedAt: row.closed_at
  };
}

const SESSION_COLUMNS = `id, business_date, opening_amount, expected_amount, counted_amount,
  difference, status, notes, opened_at, closed_at`;

/** Open-Session gate + business-date uniqueness enforced in ONE insert. */
const GATED_INSERT = `
  INSERT INTO gestion_cash_sessions (business_date, opening_amount, expected_amount, notes)
  SELECT $1::date, $2, $2, $3
  WHERE NOT EXISTS (SELECT 1 FROM gestion_cash_sessions WHERE status = 'open')
    AND NOT EXISTS (SELECT 1 FROM gestion_cash_sessions WHERE business_date = $1::date)
  RETURNING ${SESSION_COLUMNS}`;

export const cashSessionsRepository: CashSessionsPort = {
  async getById(id) {
    const { rows } = await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM gestion_cash_sessions WHERE id = $1`,
      [id]
    );
    return rows[0] === undefined ? null : mapSessionRow(rows[0]);
  },

  async list() {
    const { rows } = await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM gestion_cash_sessions ORDER BY business_date DESC, opened_at DESC`
    );
    return rows.map(mapSessionRow);
  },

  async getCurrent() {
    const { rows } = await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM gestion_cash_sessions
       WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`
    );
    return rows[0] === undefined ? null : mapSessionRow(rows[0]);
  },

  async create(input) {
    try {
      const { rows } = await query<SessionRow>(GATED_INSERT, [
        input.businessDate,
        input.openingAmount,
        input.notes ?? ""
      ]);
      return rows[0] === undefined ? null : mapSessionRow(rows[0]);
    } catch (err) {
      // Unique business_date race: another session claimed the date.
      if (isUniqueViolation(err)) {
        throw new ConflictError("Ya existe una sesión de caja para esa fecha");
      }
      throw err;
    }
  },

  async close(id, countedAmount) {
    const { rows } = await query<SessionRow>(
      `UPDATE gestion_cash_sessions
       SET status = 'closed', counted_amount = $2, difference = $2 - expected_amount,
           closed_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'open'
       RETURNING ${SESSION_COLUMNS}`,
      [id, countedAmount]
    );
    return rows[0] === undefined ? null : mapSessionRow(rows[0]);
  },

  async recordMovement(id, input) {
    const { rows } = await query<AuditRow>(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       SELECT 'cash.movement', 'cash_session', s.id::text, $2::jsonb
       FROM gestion_cash_sessions s
       WHERE s.id = $1 AND s.status = 'open'
       RETURNING id, actor_user_id, actor_role, action, entity_type, entity_id, details, created_at`,
      [id, JSON.stringify({ type: input.type, amount: input.amount, notes: input.notes ?? "" })]
    );
    return rows[0] === undefined ? null : mapAuditRow(rows[0]);
  }
};

interface AuditRow {
  id: string;
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

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}