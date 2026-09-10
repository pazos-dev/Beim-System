/**
 * Receipt aggregate (domain slice, change `clean-arch-domain` Phase 5).
 *
 * Repair ticket (`domain-entities.md` v3 §5): intake always forces
 * `Ingresado`; `transitionRepairStatus` walks Ingresado → En reparación →
 * Listo → Entregado (`Cancelado` only via `annul()`); `annul()` restores
 * consumed `taller` lots to their origin lot, flips Cancelado / Sin abonar /
 * price 0, and describes negative reversals on the original business date.
 * Immutable values; every behavior returns a new copy. No DDL/SQL here.
 */
import { restoreLots, type StockLot } from "../product/stock-lot.js";
import { NotFoundError, ValidationError } from "../shared/errors.js";
import {
  createMoney,
  createProductId,
  isPaymentStatus,
  isRepairStatus,
  type Money,
  type PaymentStatus,
  type ProductId,
  type RepairStatus
} from "../shared/types.js";

/** First receipt number of the `beim_receipt_number_seq` sequence. */
export const RECEIPT_NUMBER_START = 1000;

/** Next receipt number: 1000 when no receipt exists, else last + 1. */
export function nextReceiptNumber(last: number | null): number {
  if (last === null) {
    return RECEIPT_NUMBER_START;
  }
  if (!Number.isInteger(last) || last < RECEIPT_NUMBER_START) {
    throw new ValidationError("Recibo inválido: receiptNumber debe ser un entero >= 1000", {
      last
    });
  }
  return last + 1;
}

/** Part consumed from a `taller` lot; allocations pin the origin lot. */
export interface ReceiptPart {
  readonly id: string;
  readonly receiptId: string;
  readonly productId: ProductId | null;
  readonly quantity: number;
  readonly unitPrice: Money | null;
  readonly stockDecremented: boolean;
  readonly allocations: readonly { lotId: string; qty: number }[];
}

export interface ReceiptPayment {
  readonly id: string;
  readonly receiptId: string;
  readonly amount: Money;
  readonly method: string;
  readonly reference: string | null;
}

export interface ReceiptChecklist {
  readonly id: string;
  readonly receiptId: string;
  readonly checklistType: string;
  readonly status: string;
  readonly checks: Readonly<Record<string, unknown>>;
}

export interface Receipt {
  readonly id: string;
  readonly receiptNumber: number;
  readonly userId: string | null;
  readonly repairStatus: RepairStatus;
  readonly paymentStatus: PaymentStatus;
  readonly price: string;
  readonly parts: readonly ReceiptPart[];
  readonly payments: readonly ReceiptPayment[];
  readonly checklists: readonly ReceiptChecklist[];
}

export interface ReceiptPartInput {
  readonly id: string;
  readonly productId: string | null;
  readonly quantity: number;
  readonly unitPriceAmount?: number;
  readonly unitPriceCurrency?: string;
  readonly stockDecremented?: boolean;
  readonly allocations?: readonly { lotId: string; qty: number }[];
}

export interface ReceiptPaymentInput {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly method: string;
  readonly reference?: string;
}

export interface ReceiptChecklistInput {
  readonly id: string;
  readonly checklistType: string;
  readonly status: string;
  readonly checks?: Readonly<Record<string, unknown>>;
}

export interface CreateReceiptInput {
  readonly id: string;
  readonly receiptNumber: number;
  readonly userId?: string;
  /** Ignored on purpose: intake always forces `Ingresado`. */
  readonly repairStatus?: string;
  readonly paymentStatus?: string;
  readonly price?: string;
  readonly parts?: readonly ReceiptPartInput[];
  readonly payments?: readonly ReceiptPaymentInput[];
  readonly checklists?: readonly ReceiptChecklistInput[];
}

function cleanId(value: string, noun: string): string {
  if (value.trim() === "") {
    throw new ValidationError(`Recibo inválido: ${noun} no puede estar vacío`, { value });
  }
  return value;
}

function cleanQty(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError("Recibo inválido: quantity debe ser un entero positivo", {
      quantity: value
    });
  }
  return value;
}

function buildPart(receiptId: string, input: ReceiptPartInput): ReceiptPart {
  return {
    id: cleanId(input.id, "part id"),
    receiptId,
    productId: input.productId === null ? null : createProductId(input.productId),
    quantity: cleanQty(input.quantity),
    unitPrice:
      input.unitPriceAmount === undefined
        ? null
        : createMoney(input.unitPriceAmount, input.unitPriceCurrency ?? "UYU"),
    stockDecremented: input.stockDecremented ?? false,
    allocations: input.allocations ?? []
  };
}

function buildPayment(receiptId: string, input: ReceiptPaymentInput): ReceiptPayment {
  if (input.method.trim() === "") {
    throw new ValidationError("Recibo inválido: payment method no puede estar vacío", {});
  }
  const amount = createMoney(input.amount, input.currency);
  if (amount.amount <= 0) {
    throw new ValidationError("Recibo inválido: payment amount debe ser mayor a 0", {
      amount: amount.amount
    });
  }
  return {
    id: cleanId(input.id, "payment id"),
    receiptId,
    amount,
    method: input.method,
    reference: input.reference ?? null
  };
}

/** Intake: identity + number validated, status forced to `Ingresado`. */
export function createReceipt(input: CreateReceiptInput): Receipt {
  const id = cleanId(input.id, "id");
  if (!Number.isInteger(input.receiptNumber) || input.receiptNumber < RECEIPT_NUMBER_START) {
    throw new ValidationError("Recibo inválido: receiptNumber debe ser un entero >= 1000", {
      receiptNumber: input.receiptNumber
    });
  }
  const paymentStatus = input.paymentStatus ?? "Sin abonar";
  if (!isPaymentStatus(paymentStatus)) {
    throw new ValidationError("Recibo inválido: paymentStatus desconocido", { paymentStatus });
  }
  return {
    id,
    receiptNumber: input.receiptNumber,
    userId: input.userId ?? null,
    repairStatus: "Ingresado",
    paymentStatus,
    price: input.price ?? "",
    parts: (input.parts ?? []).map((part) => buildPart(id, part)),
    payments: (input.payments ?? []).map((payment) => buildPayment(id, payment)),
    checklists: (input.checklists ?? []).map((checklist) => ({
      id: cleanId(checklist.id, "checklist id"),
      receiptId: id,
      checklistType: checklist.checklistType,
      status: checklist.status,
      checks: checklist.checks ?? {}
    }))
  };
}

/** Forward-only chain; terminal states and `Cancelado` reject every move. */
const NEXT_REPAIR_STATUS: Record<RepairStatus, readonly RepairStatus[]> = {
  Ingresado: ["En reparación"],
  "En reparación": ["Listo"],
  Listo: ["Entregado"],
  Entregado: [],
  Cancelado: []
};

export function transitionRepairStatus(receipt: Receipt, to: string): Receipt {
  if (!isRepairStatus(to)) {
    throw new ValidationError("Recibo inválido: repairStatus desconocido", { to });
  }
  if (to === "Cancelado") {
    throw new ValidationError("Recibo inválido: Cancelado solo vía annul()", {
      status: receipt.repairStatus
    });
  }
  if (!NEXT_REPAIR_STATUS[receipt.repairStatus].includes(to)) {
    throw new ValidationError(
      `Recibo inválido: transición ${receipt.repairStatus} → ${to} no permitida`,
      { from: receipt.repairStatus, to }
    );
  }
  return { ...receipt, repairStatus: to };
}

export interface ReceiptReversal {
  readonly receiptId: string;
  readonly amount: number;
  readonly currency: string;
  readonly method: string;
  readonly paymentStatus: "Anulado";
  readonly businessDate: string;
}

export interface AnnulResult {
  readonly receipt: Receipt;
  readonly lots: ReadonlyMap<string, readonly StockLot[]>;
  readonly reversals: readonly ReceiptReversal[];
}

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Atomic cancel: validates everything first, then returns the flipped
 * receipt (Cancelado / Sin abonar / price 0) with restored `taller` lots
 * and negative reversals reusing the original business date. Pure and
 * immutable: a throw leaves the input receipt and lanes untouched.
 * Idempotent: an already `Cancelado` receipt returns unchanged, no effects.
 */
export function annulReceipt(
  receipt: Receipt,
  lanes: ReadonlyMap<string, readonly StockLot[]>,
  businessDate: string
): AnnulResult {
  if (receipt.repairStatus === "Cancelado") {
    return { receipt, lots: lanes, reversals: [] };
  }
  if (!BUSINESS_DATE_PATTERN.test(businessDate)) {
    throw new ValidationError("Recibo inválido: businessDate debe ser YYYY-MM-DD", {
      businessDate
    });
  }
  const lots = new Map<string, readonly StockLot[]>();
  for (const part of receipt.parts) {
    if (!part.stockDecremented || part.productId === null || part.allocations.length === 0) {
      continue;
    }
    const lane = lanes.get(part.productId);
    if (lane === undefined) {
      throw new NotFoundError("Recibo inválido: lote taller del repuesto desconocido", {
        productId: part.productId
      });
    }
    lots.set(part.productId, restoreLots(lane, part.allocations));
  }
  for (const [productId, lane] of lanes) {
    if (!lots.has(productId)) {
      lots.set(productId, lane);
    }
  }
  return {
    receipt: { ...receipt, repairStatus: "Cancelado", paymentStatus: "Sin abonar", price: "0" },
    lots,
    reversals: receipt.payments.map((payment) => ({
      receiptId: receipt.id,
      amount: -payment.amount.amount,
      currency: payment.amount.currency,
      method: payment.method,
      paymentStatus: "Anulado" as const,
      businessDate
    }))
  };
}
