/**
 * Receipt mapper — maps a Prisma `BeimReceipt` row (with optional parts,
 * payments, and checklists) to a local typed return.
 *
 * No contract exists in `@beim/contracts` for receipts, so we define the
 * output type locally following the same mapper pattern.
 */

import type { Prisma } from '@prisma/client'
import { parseBeimMoney } from './money'

type BeimReceiptRow = Prisma.BeimReceiptGetPayload<true>
type BeimReceiptPartRow = Prisma.BeimReceiptPartGetPayload<true>
type BeimReceiptPaymentRow = Prisma.BeimReceiptPaymentGetPayload<true>
type BeimReceiptChecklistRow = Prisma.BeimReceiptChecklistGetPayload<true>

/** Local receipt type — mirrors the legacy `mapBeimReceiptRow` shape. */
export interface BeimReceipt {
  id: string
  number: number
  status: string
  userId: string | undefined
  clientName: string
  clientId: string
  clientPhone: string
  deviceBrand: string
  deviceModel: string
  deviceColor: string
  imeiSerial: string
  assignedTechnicianId: string | undefined
  diagnosticNotes: string
  quoteStatus: string
  quoteTotal: number
  quoteSentAt: Date | undefined
  quoteApprovedAt: Date | undefined
  qaStatus: string
  qaCompletedAt: Date | undefined
  warrantyStartsAt: Date | undefined
  warrantyEndsAt: Date | undefined
  invoiceNumber: string
  paymentStatus: string
  services: string[]
  reportedIssue: string
  visualItems: string[]
  entryDateText: string
  deliveryTime: string
  deliveryUnit: string
  warrantyOffered: string
  price: number
  unlockCode: string
  unlockPassword: string
  unlockPattern: string
  terms: string
  payload: unknown
  createdAt: Date
  updatedAt: Date
  parts: BeimReceiptPart[]
  payments: BeimReceiptPayment[]
  checklists: BeimReceiptChecklist[]
}

export interface BeimReceiptPart {
  id: string
  receiptId: string
  productId: string | undefined
  quantity: number
  unitCost: number
  unitPrice: number
  warrantyDays: number
  supplierName: string
  stockDecremented: boolean
  notes: string
  createdAt: Date
}

export interface BeimReceiptPayment {
  id: string
  receiptId: string
  amount: number
  currency: string
  method: string
  reference: string
  notes: string
  createdBy: string | undefined
  createdAt: Date
}

export interface BeimReceiptChecklist {
  id: string
  receiptId: string
  checklistType: string
  status: string
  checks: unknown
  notes: string
  completedBy: string | undefined
  createdAt: Date
}

/**
 * Map a single `BeimReceiptPart` row to a local typed object.
 */
export function toReceiptPart(row: BeimReceiptPartRow): BeimReceiptPart {
  return {
    id: row.id,
    receiptId: row.receiptId,
    productId: row.productId ?? undefined,
    quantity: row.quantity,
    unitCost: Number(row.unitCost),
    unitPrice: Number(row.unitPrice),
    warrantyDays: row.warrantyDays,
    supplierName: row.supplierName,
    stockDecremented: row.stockDecremented,
    notes: row.notes,
    createdAt: row.createdAt,
  }
}

/**
 * Map a single `BeimReceiptPayment` row to a local typed object.
 */
export function toReceiptPayment(row: BeimReceiptPaymentRow): BeimReceiptPayment {
  return {
    id: row.id,
    receiptId: row.receiptId,
    amount: Number(row.amount),
    currency: row.currency,
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    createdBy: row.createdBy ?? undefined,
    createdAt: row.createdAt,
  }
}

/**
 * Map a single `BeimReceiptChecklist` row to a local typed object.
 */
export function toReceiptChecklist(row: BeimReceiptChecklistRow): BeimReceiptChecklist {
  return {
    id: row.id,
    receiptId: row.receiptId,
    checklistType: row.checklistType,
    status: row.status,
    checks: row.checks,
    notes: row.notes,
    completedBy: row.completedBy ?? undefined,
    createdAt: row.createdAt,
  }
}

/**
 * Map a Prisma `BeimReceipt` row to the local `BeimReceipt` type.
 * `price` is stored as text and parsed via `parseBeimMoney`.
 * `payload` is JSON passthrough.
 */
export function toReceiptContract(
  row: BeimReceiptRow,
  related: {
    parts?: BeimReceiptPartRow[]
    payments?: BeimReceiptPaymentRow[]
    checklists?: BeimReceiptChecklistRow[]
  } = {},
): BeimReceipt {
  return {
    id: row.id,
    number: row.receiptNumber,
    status: row.repairStatus,
    userId: row.userId ?? undefined,
    clientName: row.clientName,
    clientId: row.clientId,
    clientPhone: row.clientPhone,
    deviceBrand: row.deviceBrand,
    deviceModel: row.deviceModel,
    deviceColor: row.deviceColor,
    imeiSerial: row.imeiSerial,
    assignedTechnicianId: row.assignedTechnicianId ?? undefined,
    diagnosticNotes: row.diagnosticNotes,
    quoteStatus: row.quoteStatus,
    quoteTotal: Number(row.quoteTotal),
    quoteSentAt: row.quoteSentAt ?? undefined,
    quoteApprovedAt: row.quoteApprovedAt ?? undefined,
    qaStatus: row.qaStatus,
    qaCompletedAt: row.qaCompletedAt ?? undefined,
    warrantyStartsAt: row.warrantyStartsAt ?? undefined,
    warrantyEndsAt: row.warrantyEndsAt ?? undefined,
    invoiceNumber: row.invoiceNumber,
    paymentStatus: row.paymentStatus,
    services: row.services,
    reportedIssue: row.reportedIssue,
    visualItems: row.visualItems,
    entryDateText: row.entryDateText,
    deliveryTime: row.deliveryTime,
    deliveryUnit: row.deliveryUnit,
    warrantyOffered: row.warrantyOffered,
    price: parseBeimMoney(row.price),
    unlockCode: row.unlockCode,
    unlockPassword: row.unlockPassword,
    unlockPattern: row.unlockPattern,
    terms: row.terms,
    payload: row.payload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    parts: (related.parts ?? []).map(toReceiptPart),
    payments: (related.payments ?? []).map(toReceiptPayment),
    checklists: (related.checklists ?? []).map(toReceiptChecklist),
  }
}
