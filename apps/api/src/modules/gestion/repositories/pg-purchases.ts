/**
 * Postgres PurchasesPort (PR 3).
 *
 * The legacy `beim_purchases` / `beim_receipt_purchases` tables are NOT part
 * of the vendored 19-table schema (and schema files are out of scope) — a
 * purchase is persisted as an audit event (action 'purchase.create',
 * entity_type 'purchase', entity_id = the purchase uuid, details carrying
 * { supplierName, data }). This mirrors the legacy spirit (a purchase is a
 * financial/audit event) while keeping the supported schema untouched.
 */
import { randomUUID } from "node:crypto";
import { query } from "../../../config/db.js";
import type { JsonValue, PurchasesPort } from "../ports.js";

interface PurchaseRow {
  entity_id: string;
  details: { supplierName?: string; data?: JsonValue };
}

export const purchasesRepository: PurchasesPort = {
  async list() {
    const { rows } = await query<PurchaseRow>(
      `SELECT entity_id, details FROM audit_logs
       WHERE action = 'purchase.create' ORDER BY id DESC`
    );
    return rows.map((row) => ({
      id: row.entity_id,
      supplierName: row.details.supplierName ?? ""
    }));
  },

  async create(input) {
    const id = randomUUID();
    const { rows } = await query<PurchaseRow>(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details)
       VALUES ('purchase.create', 'purchase', $1, $2::jsonb)
       RETURNING entity_id, details`,
      [id, JSON.stringify({ supplierName: input.supplierName, data: input.data ?? {} })]
    );
    const row = rows[0];
    return { id: row.entity_id, supplierName: row.details.supplierName ?? "" };
  }
};