/**
 * Postgres PaymentMovementsPort (PR 3).
 *
 * Sales-batch and annul journal every cash-flow event tied to a receipt here
 * (legacy-faithful: legacy server.js inserts into gestion_payment_movements
 * with business_date). Annul inserts NEGATIVE reversals (payment_status
 * 'Anulado') that share the original movement's business_date, so the journal
 * sums to zero for annulled receipts — this is the financial correction the
 * spec expects from the batch (no explicit financial-state mutation).
 */
import type { TxClient } from "../../../db/withTransaction.js";
import type { PaymentMovementRow, PaymentMovementsPort } from "../ports.js";

interface MovementRow {
  id: string;
  receipt_id: string;
  amount: string; // numeric(14,2) — node-pg returns it as string
  payment_status: string;
  method: string;
  business_date: Date; // DATE — node-pg returns a Date at local midnight
  created_at: Date;
}

/** Formats a JS Date as YYYY-MM-DD in LOCAL time (DATE columns round-trip). */
function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mapMovementRow(row: MovementRow): PaymentMovementRow {
  return {
    id: Number(row.id),
    receiptId: row.receipt_id,
    amount: Number(row.amount),
    paymentStatus: row.payment_status,
    method: row.method,
    businessDate: formatLocalDate(row.business_date),
    createdAt: row.created_at
  };
}

export const paymentMovementsRepository: PaymentMovementsPort = {
  async insert(client, input) {
    const { rows } = await client.query<MovementRow>(
      `INSERT INTO gestion_payment_movements (receipt_id, amount, payment_status, method, business_date)
       VALUES ($1, $2, $3, $4, $5::date)
       RETURNING id, receipt_id, amount, payment_status, method, business_date, created_at`,
      [
        input.receiptId,
        input.amount,
        input.paymentStatus ?? "",
        input.method ?? "",
        input.businessDate
      ]
    );
    return mapMovementRow(rows[0]);
  },

  async listForReceipt(client, receiptId) {
    const { rows } = await client.query<MovementRow>(
      `SELECT id, receipt_id, amount, payment_status, method, business_date, created_at
       FROM gestion_payment_movements
       WHERE receipt_id = $1
       ORDER BY id`,
      [receiptId]
    );
    return rows.map(mapMovementRow);
  }
};