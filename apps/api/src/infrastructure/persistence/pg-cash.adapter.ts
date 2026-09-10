import type { TxClient as DriverClient } from "../../db/withTransaction.js";
import type { TxClient } from "../../domain/shared/ports.js";
import type { CashSession } from "../../domain/cash-session/cash-session.js";
import type { CashStore } from "../../application/cash/ports.js";
import { toDomainCashSession, type CashSessionTableRow } from "./pg-cash.mapper.js";

/**
 * Cash persistence (slice 3.3, change `clean-arch-infrastructure`).
 *
 * Driven adapter behind `CashStore`. `findById`/`findOpen` reuse the legacy
 * `modules/gestion/repositories/pg-cash-sessions.ts` getById/getCurrent
 * SELECTs byte-identical; `findByBusinessDate` (same projection, new WHERE)
 * backs the `BusinessDate` uniqueness check next to `findOpen`, which backs
 * the at-most-one-open guard — both guards themselves live in the domain
 * (`openCashSession`) and the application handler, this adapter is their
 * read side. `save` upserts the whole scalar aggregate in one statement
 * (`difference` null persists as the legacy 0 default on open rows);
 * `expected_amount` already folds every movement, and per-movement
 * `audit_logs` journal rows stay edge-owned (the port carries no actor).
 * Driver errors propagate untouched for the edge `toAppError` mapping.
 */
const SESSION_COLUMNS = `id, business_date, opening_amount, expected_amount, counted_amount,
  difference, status, notes, opened_at, closed_at`;

const FIND_BY_ID_SQL = `SELECT ${SESSION_COLUMNS} FROM gestion_cash_sessions WHERE id = $1`;

const FIND_OPEN_SQL = `SELECT ${SESSION_COLUMNS} FROM gestion_cash_sessions
       WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`;

const FIND_BY_DATE_SQL = `SELECT ${SESSION_COLUMNS} FROM gestion_cash_sessions WHERE business_date = $1::date`;

const SAVE_SQL =
  "INSERT INTO gestion_cash_sessions (id, business_date, opening_amount, expected_amount, counted_amount, difference, status, notes) VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET business_date = EXCLUDED.business_date, opening_amount = EXCLUDED.opening_amount, expected_amount = EXCLUDED.expected_amount, counted_amount = EXCLUDED.counted_amount, difference = EXCLUDED.difference, status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = now()";

/**
 * Bridges the opaque domain `TxClient` to the driver client (`ports.ts`:
 * adapters bridge the real driver here). Fail-closed: non-query handles
 * throw instead of touching the wrong connection.
 */
function driverOf(tx: TxClient): DriverClient {
  const candidate = tx as unknown as { query?: unknown };
  if (typeof candidate.query !== "function") {
    throw new Error("PgCashAdapter requires a pg TxClient");
  }
  return tx as unknown as DriverClient;
}

export class PgCashAdapter implements CashStore {
  async findById(tx: TxClient, id: string): Promise<CashSession | null> {
    const { rows } = await driverOf(tx).query<CashSessionTableRow>(FIND_BY_ID_SQL, [id]);
    if (rows[0] === undefined) return null;
    return toDomainCashSession(rows[0]);
  }

  async findOpen(tx: TxClient): Promise<CashSession | null> {
    const { rows } = await driverOf(tx).query<CashSessionTableRow>(FIND_OPEN_SQL, []);
    if (rows[0] === undefined) return null;
    return toDomainCashSession(rows[0]);
  }

  async findByBusinessDate(tx: TxClient, businessDate: string): Promise<CashSession | null> {
    const { rows } = await driverOf(tx).query<CashSessionTableRow>(FIND_BY_DATE_SQL, [businessDate]);
    if (rows[0] === undefined) return null;
    return toDomainCashSession(rows[0]);
  }

  async save(tx: TxClient, session: CashSession): Promise<void> {
    await driverOf(tx).query(SAVE_SQL, [
      session.id,
      session.businessDate,
      session.openingAmount,
      session.expectedAmount,
      session.countedAmount,
      session.difference ?? 0,
      session.status,
      session.notes
    ]);
  }
}
