/**
 * Gestion module repository ports (task 3.4).
 *
 * Every port is implemented against Postgres in `repositories/pg-*.ts`.
 * Repository implementations are thin SQL; business rules (batch calc, annul
 * math, session gating) live in the service layer (PR 3).
 *
 * The cash-sessions / clients / services / purchases / categories ports below
 * are minimal CRUD contracts only — their pg implementations land with the
 * gestion module (PR 3), when their storage shape is resolved.
 */
import type { TxClient } from "../../db/withTransaction.js";

/** Recursive JSON value used for jsonb passthrough payloads. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Stock mutations, serialized per product via SELECT ... FOR UPDATE inside a
 * transaction. Guarantees exactly one concurrent decrement succeeds
 * (spec: "Concurrent decrement safe").
 *
 * Every method accepts an optional `client`: when provided it participates in
 * the caller's unit of work (sales-batch/annul decide the boundary); without
 * one the repository opens its own transaction.
 */
export interface StockPort {
  /**
   * Locks the product row, requires `stock >= qty`, decrements and returns the
   * remaining stock. Throws InsufficientStockError (409, details.currentStock)
   * when the guard fails; NotFoundError (404) for unknown products.
   */
  guardDecrement(productId: string, qty: number, client?: TxClient): Promise<{ currentStock: number }>;
  /** Increments stock back by qty (annul). Throws 404 for unknown products. */
  restore(productId: string, qty: number, client?: TxClient): Promise<void>;
  /**
   * Server-authoritative unit prices (numeric, in UYU) for a product set.
   * Unknown products are absent from the map. Used by sales-batch so pricing
   * never comes from the client.
   */
  getPricesByIds(ids: readonly string[], client?: TxClient): Promise<Map<string, number>>;
}

/** Input for creating a `beim_receipts` row. Columns mirror the vendored schema. */
export interface ReceiptInsertInput {
  clientName: string;
  clientId?: string | null;
  clientPhone?: string | null;
  deviceBrand?: string | null;
  deviceModel?: string | null;
  deviceColor?: string | null;
  imeiSerial?: string | null;
  reportedIssue?: string | null;
  services?: string[] | null;
  /** Legacy text column (schema quirk: money-as-text for receipt price). */
  price?: string | null;
  repairStatus?: string | null;
  quoteStatus?: string | null;
  quoteTotal?: number | null;
  paymentStatus?: string | null;
  /** jsonb payload — passed through verbatim (spec: JSONB backward compatibility). */
  payload: JsonValue;
}

/** A `beim_receipts` row read back through the repository (camelCase). */
export interface BeimReceipt {
  id: string;
  receiptNumber: number;
  clientName: string;
  clientId: string | null;
  clientPhone: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  deviceColor: string | null;
  imeiSerial: string | null;
  reportedIssue: string | null;
  services: string[] | null;
  price: string;
  repairStatus: string;
  quoteStatus: string;
  quoteTotal: number;
  paymentStatus: string;
  /** jsonb payload preserved byte-for-byte from insert. */
  payload: JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

/** One line item of a sales-batch (beim_receipt_parts row). */
export interface ReceiptPartRow {
  receiptId: string;
  productId: string | null;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  warrantyDays: number;
  supplierName: string;
  stockDecremented: boolean;
}

export interface ReceiptsListFilter {
  client?: string;
  paymentMethod?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ReceiptsPort {
  /**
   * Inserts a receipt. Uses `client` when provided (joins the caller's unit of
   * work, e.g. sales-batch/annul); opens its own transaction otherwise.
   */
  insertReceipt(input: ReceiptInsertInput, client?: TxClient): Promise<BeimReceipt>;
  /** Preview of the next `beim_receipt_number_seq` value (read-only, no advance). */
  nextNumber(): Promise<number>;
  /**
   * Flips an existing receipt to Cancelado / Sin abonar / price 0 inside the
   * caller's transaction. Stock restoration math is the service layer's job —
   * this only marks the receipt.
   */
  markAnnuled(client: TxClient, receiptId: string): Promise<void>;
  /** Paginated receipt list; `client` matches name, `paymentMethod` exists in gestures. */
  list(filter: ReceiptsListFilter): Promise<{ items: BeimReceipt[]; total: number; page: number; limit: number }>;
  getById(id: string, client?: TxClient): Promise<BeimReceipt | null>;
  /** Parts of a receipt that consumed stock (annul restoration candidates). */
  getConsumedParts(client: TxClient, receiptId: string): Promise<ReceiptPartRow[]>;
  /**
   * Inserts parts marked stock_decremented=true (sales-batch already
   * decremented the stock). Caller owns the transaction.
   */
  insertParts(
    client: TxClient,
    receiptId: string,
    parts: ReadonlyArray<{
      productId: string;
      quantity: number;
      unitCost: number;
      unitPrice: number;
      warrantyDays?: number;
    }>
  ): Promise<void>;
}

export interface FinancialStateData {
  capitalInitial: number;
  expenses: JsonValue;
  menuItems: JsonValue;
  accountingState: JsonValue;
  preferences: JsonValue;
}

export interface FinancialStateRow extends FinancialStateData {
  singletonId: 1;
  updatedAt: Date;
}

export interface FinancialStatePort {
  /** Returns the singleton row or null when it does not exist yet. */
  getSingleton(): Promise<FinancialStateRow | null>;
  /** Upserts the singleton (singleton_id=1). Returns the stored row. */
  upsertSingleton(state: FinancialStateData): Promise<FinancialStateRow>;
}

/**
 * Payment movements journal (gestion_payment_movements): the legacy record of
 * every cash-flow event tied to a receipt. Sales-batch inserts one movement
 * per payment; annul inserts a negative reversal (payment_status 'Anulado')
 * so the journal sums to zero for annulled receipts.
 */
export interface PaymentMovementRow {
  id: number;
  receiptId: string;
  amount: number;
  paymentStatus: string;
  method: string;
  businessDate: string;
  createdAt: Date;
}

export interface PaymentMovementsPort {
  /** Inserts one movement inside the caller's transaction. */
  insert(
    client: TxClient,
    input: { receiptId: string; amount: number; paymentStatus?: string; method?: string; businessDate: string }
  ): Promise<PaymentMovementRow>;
  /** Movements for a receipt, ascending by id (originals then reversals). */
  listForReceipt(client: TxClient, receiptId: string): Promise<PaymentMovementRow[]>;
}

/** A generic audit_logs row (cash-session and stock movements journal here). */
export interface AuditLogRow {
  id: string; // bigserial → node-pg returns it as string
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: JsonValue;
  createdAt: Date;
}

export interface AuditLogsPort {
  insert(input: {
    actorUserId?: string | null;
    actorRole?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: JsonValue;
  }): Promise<AuditLogRow>;
  list(filter: {
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
  }): Promise<AuditLogRow[]>;
}

/* ---------------------------------------------------------------------------
 * Minimal CRUD contracts. Storage shapes resolved in PR 3: clients map to the
 * `users` table (role 'cliente'); categories to `categories`; services are
 * jsonb documents in `app_settings` (key 'gestion.services.<uuid>'); purchases
 * are audit events (action 'purchase.create') — legacy tables for those
 * concepts are NOT part of the vendored 19-table schema.
 * ------------------------------------------------------------------------- */

export interface CashSessionRow {
  id: string;
  businessDate: string;
  openingAmount: number;
  expectedAmount: number;
  countedAmount: number | null;
  difference: number;
  status: string;
  notes: string;
  openedAt: Date;
  closedAt: Date | null;
}

/**
 * Cash sessions. Gating semantics (which condition, which error) live in the
 * service layer; the repository provides the atomic primitives:
 *  - `create` returns null when a session is already open OR the business date
 *    is taken (atomic gated INSERT) — the service translates null to 409;
 *  - `close` returns null when the session is not open (service: 409);
 *  - `recordMovement` journals only for open sessions, returns null otherwise.
 */
export interface CashSessionsPort {
  getById(id: string): Promise<CashSessionRow | null>;
  list(): Promise<CashSessionRow[]>;
  /** The currently open session, or null when all are closed. */
  getCurrent(): Promise<CashSessionRow | null>;
  create(input: { businessDate: string; openingAmount: number; notes?: string }): Promise<CashSessionRow | null>;
  close(id: string, countedAmount: number): Promise<CashSessionRow | null>;
  recordMovement(
    id: string,
    input: { type: string; amount: number; notes?: string }
  ): Promise<AuditLogRow | null>;
}

/** Stock movements journal (audit_logs, action 'stock.movement'). */
export interface StockMovementRecord {
  id: string;
  productId: string;
  movementType: string;
  quantity: number;
  detail: string;
  createdAt: Date;
}

export interface StockMovementsPort {
  /** Requires the product to exist (404 otherwise), then journals the movement. */
  record(input: {
    productId: string;
    movementType: string;
    quantity: number;
    detail?: string;
  }): Promise<StockMovementRecord>;
  list(filter: { productId?: string; from?: string; to?: string }): Promise<StockMovementRecord[]>;
}

/** Clients map onto the legacy `users` table (role cliente) — PR 3 confirms. */
export interface ClientRecord {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ci: string | null;
  rut: string | null;
  company: string | null;
  isApproved: boolean;
}

/** Active filter for catalog lists: boolean narrows, "all" disables the filter. */
export type ActiveFilter = boolean | "all";

export interface ClientsPort {
  list(filter?: { active?: ActiveFilter }): Promise<ClientRecord[]>;
  getById(id: string): Promise<ClientRecord | null>;
  create(input: { name: string; email?: string; phone?: string }): Promise<ClientRecord>;
  /** Partial profile edit (name/email/phone only; approval flows via usersService). */
  update(id: string, input: { name?: string; email?: string; phone?: string }): Promise<ClientRecord | null>;
}

export interface CategoriesPort {
  list(filter?: { active?: ActiveFilter }): Promise<Array<{ id: string; name: string; code: string; parentId: string | null; active: boolean }>>;
  getById(id: string): Promise<{ id: string; name: string; code: string; parentId: string | null; active: boolean } | null>;
  create(input: { id: string; name: string; code: string }): Promise<{ id: string; name: string; code: string; parentId: string | null; active: boolean }>;
  /** Partial merge: only present fields are written; `active` maps to `is_active`. */
  update(id: string, input: { name?: string; code?: string; active?: boolean }): Promise<{ id: string; name: string; code: string; parentId: string | null; active: boolean } | null>;
}

/** No legacy table backs services/purchases yet — payload passthrough contracts. */
export interface ServicesPort {
  list(filter?: { active?: ActiveFilter }): Promise<Array<{ id: string; name: string; active: boolean }>>;
  getById(id: string): Promise<{ id: string; name: string; active: boolean } | null>;
  create(input: { name: string; data?: JsonValue }): Promise<{ id: string; name: string; active: boolean }>;
  /** Partial merge: only present fields are written; `active` maps to `isActive` in the stored doc. */
  update(id: string, input: { name?: string; data?: JsonValue; active?: boolean }): Promise<{ id: string; name: string; active: boolean } | null>;
}

export interface PurchasesPort {
  list(filter?: { active?: ActiveFilter }): Promise<Array<{ id: string; supplierName: string; active: boolean }>>;
  getById(id: string): Promise<{ id: string; supplierName: string; active: boolean } | null>;
  create(input: { supplierName: string; data?: JsonValue }): Promise<{ id: string; supplierName: string; active: boolean }>;
  /** Partial merge: only present fields are written; `active` maps to `isActive` in details. */
  update(id: string, input: { supplierName?: string; data?: JsonValue; active?: boolean }): Promise<{ id: string; supplierName: string; active: boolean } | null>;
}