import { createMoney, createProductId } from "../../domain/shared/types.js";
import type {
  Receipt,
  ReceiptChecklist,
  ReceiptPart,
  ReceiptPayment
} from "../../domain/receipt/receipt.js";

/**
 * Receipt rows (slice 3.2, change `clean-arch-infrastructure`).
 *
 * Header + `parts`/`payments`/`checklists` children hydrate one `Receipt`;
 * `price` stays text end to end (legacy money-as-text quirk, never `Number`);
 * no hashes or secrets cross by shape. Lot allocations pin at consume time
 * (application), so loads carry `allocations: []`.
 */

export interface ReceiptHeaderRow {
  id: string;
  receipt_number: number;
  user_id: string | null;
  repair_status: string;
  payment_status: string;
  /** money-as-text: node-pg returns it verbatim, never parsed. */
  price: string;
}

export interface ReceiptPartRow {
  id: string;
  receipt_id: string;
  product_id: string | null;
  quantity: number;
  unit_cost: string | number;
  unit_price: string | number;
  warranty_days: number;
  supplier_name: string;
  stock_decremented: boolean;
}

export interface ReceiptPaymentRow {
  id: string;
  receipt_id: string;
  amount: string | number;
  currency: string;
  method: string;
  reference: string | null;
}

export interface ReceiptChecklistRow {
  id: string;
  receipt_id: string;
  checklist_type: string;
  status: string;
  checks: unknown;
}

/** `gestion_payment_movements` row (annul reversal journal). */
export interface PaymentMovementRow {
  id: number;
  receipt_id: string;
  amount: string | number;
  payment_status: string;
  method: string;
  /** DATE column — node-pg returns a Date at local midnight. */
  business_date: Date | string;
  created_at: Date;
}

function toDomainPart(row: ReceiptPartRow): ReceiptPart {
  const unitPrice = Number(row.unit_price);
  return {
    id: row.id,
    receiptId: row.receipt_id,
    productId: row.product_id === null ? null : createProductId(row.product_id),
    quantity: row.quantity,
    // The table carries no currency and `0` marks absence (save maps null → 0).
    unitPrice: unitPrice === 0 ? null : createMoney(unitPrice, "UYU"),
    stockDecremented: row.stock_decremented,
    allocations: []
  };
}

function toDomainPayment(row: ReceiptPaymentRow): ReceiptPayment {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    amount: createMoney(Number(row.amount), row.currency),
    method: row.method,
    reference: row.reference === null || row.reference === "" ? null : row.reference
  };
}

function toDomainChecklist(row: ReceiptChecklistRow): ReceiptChecklist {
  const checks = row.checks;
  return {
    id: row.id,
    receiptId: row.receipt_id,
    checklistType: row.checklist_type,
    status: row.status,
    checks:
      typeof checks === "object" && checks !== null && !Array.isArray(checks)
        ? (checks as Readonly<Record<string, unknown>>)
        : {}
  };
}

/** Header + children → `Receipt` (statuses trusted: domain validated on intake). */
export function toDomainReceipt(
  header: ReceiptHeaderRow,
  parts: readonly ReceiptPartRow[],
  payments: readonly ReceiptPaymentRow[],
  checklists: readonly ReceiptChecklistRow[]
): Receipt {
  return {
    id: header.id,
    receiptNumber: header.receipt_number,
    userId: header.user_id,
    repairStatus: header.repair_status as Receipt["repairStatus"],
    paymentStatus: header.payment_status as Receipt["paymentStatus"],
    price: header.price,
    parts: parts.map(toDomainPart),
    payments: payments.map(toDomainPayment),
    checklists: checklists.map(toDomainChecklist)
  };
}

function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Movement row → journal entry (amount numeric, date as `YYYY-MM-DD`). */
export function toDomainMovement(row: PaymentMovementRow): {
  id: number;
  receiptId: string;
  amount: number;
  paymentStatus: string;
  method: string;
  businessDate: string;
  createdAt: Date;
} {
  return {
    id: Number(row.id),
    receiptId: row.receipt_id,
    amount: Number(row.amount),
    paymentStatus: row.payment_status,
    method: row.method,
    businessDate: row.business_date instanceof Date ? formatLocalDate(row.business_date) : row.business_date,
    createdAt: row.created_at
  };
}
