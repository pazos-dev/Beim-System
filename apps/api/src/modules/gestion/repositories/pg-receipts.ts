/**
 * Postgres ReceiptsPort implementation (task 3.4 + PR 3).
 *
 * Thin SQL only: receipt numbering preview, insert with jsonb payload
 * passthrough, annul status flip, paginated list, by-id read and the
 * sales-batch parts writer. The sales/annul business math (stock restoration
 * calculation) lives in the service layer (PR 3); this repository only
 * persists rows inside the caller's transaction.
 */
import { query } from "../../../config/db.js";
import { withTransaction, type TxClient } from "../../../db/withTransaction.js";
import { NotFoundError } from "../../../errors/taxonomy.js";
import type { BeimReceipt, ReceiptInsertInput, ReceiptsListFilter, ReceiptsPort } from "../ports.js";

interface ReceiptRow {
  id: string;
  receipt_number: number;
  client_name: string;
  client_id: string | null;
  client_phone: string | null;
  device_brand: string | null;
  device_model: string | null;
  device_color: string | null;
  imei_serial: string | null;
  reported_issue: string | null;
  services: string[] | null;
  price: string;
  repair_status: string;
  quote_status: string;
  quote_total: string;
  payment_status: string;
  payload: unknown;
  created_at: Date;
  updated_at: Date;
}

function mapReceiptRow(row: ReceiptRow): BeimReceipt {
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    clientName: row.client_name,
    clientId: row.client_id,
    clientPhone: row.client_phone,
    deviceBrand: row.device_brand,
    deviceModel: row.device_model,
    deviceColor: row.device_color,
    imeiSerial: row.imei_serial,
    reportedIssue: row.reported_issue,
    services: row.services,
    price: row.price,
    repairStatus: row.repair_status,
    quoteStatus: row.quote_status,
    quoteTotal: Number(row.quote_total),
    paymentStatus: row.payment_status,
    payload: row.payload as BeimReceipt["payload"],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Insert columns are drawn ONLY from the closed set below, in fixed order —
 * absent input keys are omitted so DB defaults (repair_status 'Ingresado',
 * quote_status 'Borrador', payment_status 'Pendiente') keep applying.
 */
const INSERT_FIELDS: ReadonlyArray<readonly [keyof ReceiptInsertInput, string]> = [
  ["clientName", "client_name"],
  ["clientId", "client_id"],
  ["clientPhone", "client_phone"],
  ["deviceBrand", "device_brand"],
  ["deviceModel", "device_model"],
  ["deviceColor", "device_color"],
  ["imeiSerial", "imei_serial"],
  ["reportedIssue", "reported_issue"],
  ["services", "services"],
  ["price", "price"],
  ["repairStatus", "repair_status"],
  ["quoteStatus", "quote_status"],
  ["quoteTotal", "quote_total"],
  ["paymentStatus", "payment_status"],
  ["payload", "payload"]
] as const;

async function insertReceiptOn(tx: TxClient, input: ReceiptInsertInput): Promise<BeimReceipt> {
  const fields = INSERT_FIELDS.filter(([key]) => input[key] !== undefined);
  const columns = fields.map(([, column]) => column);
  const values = fields.map(([key]) =>
    // Explicit JSON serialization for the jsonb payload column: node-pg does
    // not auto-serialize plain objects for jsonb when passed inside arrays.
    key === "payload" ? JSON.stringify(input[key]) : input[key]
  );
  const placeholders = fields.map((_, index) => `$${index + 1}`);

  const result = await tx.query<ReceiptRow>(
    `INSERT INTO beim_receipts (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values
  );
  return mapReceiptRow(result.rows[0]);
}

interface PartRow {
  receipt_id: string;
  product_id: string | null;
  quantity: number;
  unit_cost: string;
  unit_price: string;
  warranty_days: number;
  supplier_name: string;
  stock_decremented: boolean;
}

export const receiptsRepository: ReceiptsPort = {
  async insertReceipt(input, client) {
    if (client !== undefined) return insertReceiptOn(client, input);
    return withTransaction((tx) => insertReceiptOn(tx, input));
  },

  async nextNumber() {
    // Read-only preview of beim_receipt_number_seq (starts at 1000). Reading
    // last_value + is_called does NOT advance the sequence — a bookable
    // preview, not a reservation.
    const { rows } = await query<{ last_value: string; is_called: boolean }>(
      "SELECT last_value, is_called FROM beim_receipt_number_seq"
    );
    const { last_value, is_called } = rows[0];
    return is_called ? Number(last_value) + 1 : Number(last_value);
  },

  async markAnnuled(client, receiptId) {
    const result = await client.query(
      `UPDATE beim_receipts
       SET repair_status = 'Cancelado', payment_status = 'Sin abonar', price = '0', updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [receiptId]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError(`Recibo no encontrado: ${receiptId}`);
    }
  },

  async list(filter) {
    // Clamp SQL-interpolated pagination bounds (HTTP layer validates too, but
    // service callers must not be able to inject SQL through LIMIT/OFFSET).
    const page = Math.max(filter.page ?? 1, 1);
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = (page - 1) * limit;

    const where = `
      WHERE ($1::text IS NULL OR lower(client_name) LIKE '%' || lower($1) || '%')
        AND ($2::text IS NULL OR EXISTS (
              SELECT 1 FROM gestion_payment_movements pm
              WHERE pm.receipt_id = beim_receipts.id AND pm.method = $2
            ))
        AND ($3::date IS NULL OR created_at::date >= $3)
        AND ($4::date IS NULL OR created_at::date <= $4)`;
    const params: unknown[] = [
      filter.client ?? null,
      filter.paymentMethod ?? null,
      filter.from ?? null,
      filter.to ?? null
    ];

    const { rows } = await query<ReceiptRow>(
      `SELECT * FROM beim_receipts${where} ORDER BY receipt_number DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const { rows: countRows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM beim_receipts${where}`,
      params
    );

    return {
      items: rows.map(mapReceiptRow),
      total: Number(countRows[0].n),
      page,
      limit
    };
  },

  async getById(id, client) {
    const select = "SELECT * FROM beim_receipts WHERE id = $1";
    if (client !== undefined) {
      const { rows } = await client.query<ReceiptRow>(select, [id]);
      return rows[0] === undefined ? null : mapReceiptRow(rows[0]);
    }
    const { rows } = await query<ReceiptRow>(select, [id]);
    return rows[0] === undefined ? null : mapReceiptRow(rows[0]);
  },

  async getConsumedParts(client, receiptId) {
    const { rows } = await client.query<PartRow>(
      `SELECT receipt_id, product_id, quantity, unit_cost, unit_price, warranty_days, supplier_name, stock_decremented
       FROM beim_receipt_parts
       WHERE receipt_id = $1 AND stock_decremented
       ORDER BY created_at, id`,
      [receiptId]
    );
    return rows.map((row) => ({
      receiptId: row.receipt_id,
      productId: row.product_id,
      quantity: row.quantity,
      unitCost: Number(row.unit_cost),
      unitPrice: Number(row.unit_price),
      warrantyDays: row.warranty_days,
      supplierName: row.supplier_name,
      stockDecremented: row.stock_decremented
    }));
  },

  async insertParts(client, receiptId, parts) {
    for (const part of parts) {
      await client.query(
        `INSERT INTO beim_receipt_parts
           (receipt_id, product_id, quantity, unit_cost, unit_price, warranty_days, stock_decremented)
         VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [
          receiptId,
          part.productId,
          part.quantity,
          part.unitCost,
          part.unitPrice,
          part.warrantyDays ?? 30
        ]
      );
    }
  }
};