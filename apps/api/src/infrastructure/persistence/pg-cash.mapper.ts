import type { CashSession, CashSessionStatus } from "../../domain/cash-session/cash-session.js";

/**
 * Cash row mapping (slice 3.3, change `clean-arch-infrastructure`).
 *
 * Reads reuse the legacy `gestion_cash_sessions` projection (including
 * `opened_at`/`closed_at`, which the domain root does not carry). Rows never
 * carry movements — the journal lives in `audit_logs` and stays edge-owned —
 * so every mapped root starts with `movements: []`. An open row stores the
 * legacy `difference` default (0) and maps back to `null`: the domain
 * invariant is "no difference until close". Unknown statuses fail closed.
 */
export interface CashSessionTableRow {
  id: string;
  business_date: Date | string;
  opening_amount: string | number;
  expected_amount: string | number;
  counted_amount: string | number | null;
  difference: string | number | null;
  status: string;
  notes: string;
}

function formatBusinessDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function checkStatus(value: string): CashSessionStatus {
  if (value === "open" || value === "closed") return value;
  throw new Error(`PgCashAdapter: unknown cash status "${value}"`);
}

export function toDomainCashSession(row: CashSessionTableRow): CashSession {
  const status = checkStatus(row.status);
  return {
    id: row.id,
    businessDate: formatBusinessDate(row.business_date),
    openingAmount: Number(row.opening_amount),
    expectedAmount: Number(row.expected_amount),
    countedAmount: row.counted_amount === null ? null : Number(row.counted_amount),
    difference: status === "open" ? null : Number(row.difference),
    status,
    notes: row.notes,
    movements: []
  };
}
