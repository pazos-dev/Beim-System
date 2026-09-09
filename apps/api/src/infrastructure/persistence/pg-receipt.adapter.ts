import { withTransaction, type TxClient as DriverClient } from "../../db/withTransaction.js";
import { NotFoundError } from "../../errors/taxonomy.js";
import type { Receipt } from "../../domain/receipt/receipt.js";
import type { ReceiptRepository } from "../../domain/receipt/receipt.repository.js";
import { queryOn } from "./pg-session.adapter.js";
import {
  toDomainMovement,
  toDomainReceipt,
  type PaymentMovementRow,
  type ReceiptChecklistRow,
  type ReceiptHeaderRow,
  type ReceiptPartRow,
  type ReceiptPaymentRow
} from "./pg-receipt.mapper.js";

/**
 * Receipt persistence (slice 3.2, change `clean-arch-infrastructure`).
 *
 * Driven adapter behind the domain `ReceiptRepository` port. Intake inserts
 * the header from a closed field set in fixed order (absent keys omitted so
 * DB defaults keep applying) with `repair_status` forced to `Ingresado`
 * whatever the aggregate carries — mirroring `receiptsService.create` — and
 * `price` passed through as text. Children (`parts`/`payments`/`checklists`)
 * persist on the same connection; the annul flip and the movement journal
 * reuse the legacy statements byte-identical.
 *
 * DELTAS (same class as I2 `findById` / I3 `SAVE_PRODUCT`, need spec
 * ratification): no legacy receipt insert sets `id`/`receipt_number`
 * (sequence defaults) — the adapter passes the aggregate identity so
 * `findById` round-trips; the parts writer parametrizes `stock_decremented`
 * (legacy hardcodes `true`) so non-consuming intake parts persist truthfully;
 * header/child SELECTs are narrowed projections (legacy reads `SELECT *`).
 * `beim_receipt_payments` / `beim_receipt_checklists` have no legacy writer —
 * their INSERTs are new, column-ordered after the schema.
 */
const SELECT_HEADER =
  "SELECT id, receipt_number, user_id, repair_status, payment_status, price FROM beim_receipts WHERE id = $1";

const SELECT_PARTS =
  "SELECT id, receipt_id, product_id, quantity, unit_cost, unit_price, warranty_days, supplier_name, stock_decremented FROM beim_receipt_parts WHERE receipt_id = $1 ORDER BY created_at, id";

const SELECT_PAYMENTS =
  "SELECT id, receipt_id, amount, currency, method, reference FROM beim_receipt_payments WHERE receipt_id = $1 ORDER BY created_at, id";

const SELECT_CHECKLISTS =
  "SELECT id, receipt_id, checklist_type, status, checks FROM beim_receipt_checklists WHERE receipt_id = $1 ORDER BY created_at, id";

const INSERT_PART =
  "INSERT INTO beim_receipt_parts (receipt_id, product_id, quantity, unit_cost, unit_price, warranty_days, stock_decremented) VALUES ($1, $2, $3, $4, $5, $6, $7)";

const INSERT_PAYMENT =
  "INSERT INTO beim_receipt_payments (id, receipt_id, amount, currency, method, reference) VALUES ($1, $2, $3, $4, $5, $6)";

const INSERT_CHECKLIST =
  "INSERT INTO beim_receipt_checklists (id, receipt_id, checklist_type, status, checks) VALUES ($1, $2, $3, $4, $5::jsonb)";

const MARK_ANNULED_SQL = `UPDATE beim_receipts
       SET repair_status = 'Cancelado', payment_status = 'Sin abonar', price = '0', updated_at = now()
       WHERE id = $1
       RETURNING id`;

const MOVEMENT_INSERT = `INSERT INTO gestion_payment_movements (receipt_id, amount, payment_status, method, business_date)
       VALUES ($1, $2, $3, $4, $5::date)
       RETURNING id, receipt_id, amount, payment_status, method, business_date, created_at`;

const MOVEMENTS_SELECT = `SELECT id, receipt_id, amount, payment_status, method, business_date, created_at
       FROM gestion_payment_movements
       WHERE receipt_id = $1
       ORDER BY id`;

export interface ReceiptReversalInput {
  readonly receiptId: string;
  /** Negative amount; shares the ORIGINAL movement business date. */
  readonly amount: number;
  readonly method: string;
  readonly businessDate: string;
}

export class PgReceiptAdapter implements ReceiptRepository {
  async findById(id: string, client?: DriverClient): Promise<Receipt | null> {
    const headers = await queryOn<ReceiptHeaderRow>(client, SELECT_HEADER, [id]);
    const header = headers[0];
    if (header === undefined) return null;
    const [parts, payments, checklists] = await Promise.all([
      queryOn<ReceiptPartRow>(client, SELECT_PARTS, [id]),
      queryOn<ReceiptPaymentRow>(client, SELECT_PAYMENTS, [id]),
      queryOn<ReceiptChecklistRow>(client, SELECT_CHECKLISTS, [id])
    ]);
    return toDomainReceipt(header, parts, payments, checklists);
  }

  async save(receipt: Receipt, client?: DriverClient): Promise<void> {
    const run = async (tx: DriverClient): Promise<void> => {
      const columns = ["id", "receipt_number"];
      const values: unknown[] = [receipt.id, receipt.receiptNumber];
      if (receipt.userId !== null) {
        columns.push("user_id");
        values.push(receipt.userId);
      }
      columns.push("price", "repair_status", "payment_status");
      // Forced Ingresado: intake authority lives here too, not just in domain.
      values.push(receipt.price, "Ingresado", receipt.paymentStatus);
      const placeholders = values.map((_, index) => `$${index + 1}`);
      await tx.query(`INSERT INTO beim_receipts (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`, values);
      for (const part of receipt.parts) {
        await tx.query(INSERT_PART, [
          receipt.id,
          part.productId,
          part.quantity,
          0,
          part.unitPrice === null ? 0 : part.unitPrice.amount,
          30,
          part.stockDecremented
        ]);
      }
      for (const payment of receipt.payments) {
        await tx.query(INSERT_PAYMENT, [
          payment.id,
          receipt.id,
          payment.amount.amount,
          payment.amount.currency,
          payment.method,
          payment.reference ?? ""
        ]);
      }
      for (const checklist of receipt.checklists) {
        await tx.query(INSERT_CHECKLIST, [
          checklist.id,
          receipt.id,
          checklist.checklistType,
          checklist.status,
          JSON.stringify(checklist.checks)
        ]);
      }
    };
    if (client !== undefined) await run(client);
    else await withTransaction(run);
  }

  /** Annul flip inside the caller transaction; 404 when the receipt is missing. */
  async markAnnuled(client: DriverClient, receiptId: string): Promise<void> {
    const result = await client.query(MARK_ANNULED_SQL, [receiptId]);
    if (result.rowCount === 0) {
      throw new NotFoundError(`Recibo no encontrado: ${receiptId}`);
    }
  }

  /** Journal movements ascending (originals then reversals). */
  async listMovements(client: DriverClient, receiptId: string) {
    const { rows } = await client.query<PaymentMovementRow>(MOVEMENTS_SELECT, [receiptId]);
    return rows.map(toDomainMovement);
  }

  /** Negative `Anulado` reversal sharing the original business date. */
  async insertReversal(client: DriverClient, input: ReceiptReversalInput) {
    const { rows } = await client.query<PaymentMovementRow>(MOVEMENT_INSERT, [
      input.receiptId,
      input.amount,
      "Anulado",
      input.method,
      input.businessDate
    ]);
    return toDomainMovement(rows[0]);
  }
}
