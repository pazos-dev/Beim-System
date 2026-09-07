/**
 * Postgres PurchasesPort (PR 3, issue #87 update/deactivate).
 *
 * The legacy `beim_purchases` / `beim_receipt_purchases` tables are NOT part
 * of the vendored 19-table schema (and schema files are out of scope) — a
 * purchase is persisted as an audit event (action 'purchase.create',
 * entity_type 'purchase', entity_id = the purchase uuid, details carrying
 * { supplierName, data, isActive }). This mirrors the legacy spirit (a
 * purchase is a financial/audit event) while keeping the supported schema
 * untouched. `isActive` absent counts as active (legacy compatible);
 * migration 0003 backfills it on existing rows.
 */
import { randomUUID } from "node:crypto";
import { query } from "../../../config/db.js";
import type { ActiveFilter, JsonValue, PurchasesPort } from "../ports.js";

interface PurchaseRow {
  entity_id: string;
  details: { supplierName?: string; data?: JsonValue; isActive?: boolean };
}

interface PurchaseRecord {
  id: string;
  supplierName: string;
  active: boolean;
}

function mapPurchaseRow(row: PurchaseRow): PurchaseRecord {
  return {
    id: row.entity_id,
    supplierName: row.details.supplierName ?? "",
    active: row.details.isActive ?? true
  };
}

function matchesFilter(row: PurchaseRow, active: ActiveFilter | undefined): boolean {
  if (active === "all") return true;
  const want = active ?? true;
  return (row.details.isActive ?? true) === want;
}

const SELECT_ALL = `SELECT entity_id, details FROM audit_logs WHERE action = 'purchase.create' ORDER BY id DESC`;

export const purchasesRepository: PurchasesPort = {
  async list(filter?: { active?: ActiveFilter }) {
    const { rows } = await query<PurchaseRow>(SELECT_ALL);
    return rows.filter((row) => matchesFilter(row, filter?.active)).map(mapPurchaseRow);
  },

  async getById(id) {
    const { rows } = await query<PurchaseRow>(
      `SELECT entity_id, details FROM audit_logs WHERE action = 'purchase.create' AND entity_id = $1`,
      [id]
    );
    return rows[0] === undefined ? null : mapPurchaseRow(rows[0]);
  },

  async create(input) {
    const id = randomUUID();
    const { rows } = await query<PurchaseRow>(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('purchase.create', 'purchase', $1, $2::jsonb)
       RETURNING entity_id, details`,
      [id, JSON.stringify({ supplierName: input.supplierName, data: input.data ?? {}, isActive: true })]
    );
    const row = rows[0];
    return mapPurchaseRow(row);
  },

  async update(id, input) {
    const { rows } = await query<PurchaseRow>(
      `SELECT entity_id, details FROM audit_logs WHERE action = 'purchase.create' AND entity_id = $1`,
      [id]
    );
    const current = rows[0];
    if (current === undefined) return null;
    // Partial merge: only present fields are written.
    const next = {
      supplierName: input.supplierName ?? current.details.supplierName ?? "",
      data: input.data ?? current.details.data ?? {},
      isActive: input.active ?? current.details.isActive ?? true
    };
    const { rows: updated } = await query<PurchaseRow>(
      `UPDATE audit_logs SET details = $2::jsonb WHERE action = 'purchase.create' AND entity_id = $1
       RETURNING entity_id, details`,
      [id, JSON.stringify(next)]
    );
    return mapPurchaseRow(updated[0]);
  }
};
