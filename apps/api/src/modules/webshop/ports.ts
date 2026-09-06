/**
 * Webshop module repository ports (task 3.4).
 *
 * Orders are created transactionally (order + items) and always start unpaid
 * — payment flips exclusively through the checkout webhook (spec: "Order then
 * pay"). The catalog reader is read-optimized; stock and receipts stay owned
 * by the gestion module (shared tables, single owner per resource).
 */
import type { TxClient } from "../../db/withTransaction.js";
import type { JsonValue } from "../gestion/ports.js";

export interface OrderInsertInput {
  customer: string;
  email?: string | null;
  phone?: string | null;
  ci?: string | null;
  rut?: string | null;
  address?: string | null;
  shipping?: string | null;
  comments?: string | null;
  total: number;
  currency: string;
}

export interface OrderItemInsertInput {
  productId?: string | null;
  productCode?: number | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

/** Unpaid order defaults are the repository's contract: status Pendiente,
 * payment Pendiente de pago, stock_committed false. */
export interface OrderRow {
  id: string;
  customer: string;
  email: string | null;
  total: number;
  currency: string;
  status: string;
  paymentStatus: string;
  stockCommitted: boolean;
  createdAt: Date;
}

export interface OrderItemRow {
  id: number;
  orderId: string;
  productId: string | null;
  productCode: number | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
}

export interface OrderWithItems {
  order: OrderRow;
  items: OrderItemRow[];
}

export interface OrdersPort {
  /**
   * Inserts the order and its items inside one transaction. Uses `client`
   * when provided (caller-owned unit of work), opens its own otherwise.
   */
  insertOrder(
    input: OrderInsertInput,
    items: OrderItemInsertInput[],
    client?: TxClient
  ): Promise<{ order: OrderRow; items: OrderItemRow[] }>;
  /** Orders owned by a user, newest first, paginated. Optional props keep
   * `req.query` assignable (same weak-type pattern as gestion filters). */
  listByUser(
    userId: string,
    options: { page?: number; limit?: number }
  ): Promise<{ items: OrderRow[]; total: number; page: number; limit: number }>;
  /** An order + items the user owns, or null (404 — no existence leak). */
  getByUser(userId: string, orderId: string): Promise<OrderWithItems | null>;
}

export interface CatalogItem {
  id: string;
  productCode: number | null;
  name: string;
  categoryId: string;
  brand: string;
  model: string;
  price: number;
  currency: string;
  stock: number;
  badge: string;
  image: string | null;
  description: string;
}

export interface CatalogPage {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: CatalogItem[];
}

export interface CatalogListOptions {
  /** 1-based page; optional so `req.query` is assignable (weak type). */
  page?: number;
  /** Items per page, bounded by the repository (1..100). */
  limit?: number;
  /** Exact category_id filter, e.g. "celulares". */
  category?: string;
  /** Case-insensitive term over name/brand/model. */
  search?: string;
}

export interface CatalogPort {
  /**
   * Paginated published-product reader (page >= 1, 1 <= limit <= 100).
   *
   * PUBLISHED SEMANTICS (decision, PR 4): the vendored `products` table has
   * no `published` column, and `promo_slides` has none either — the migration
   * `0001-webshop-auth-catalog.sql` adds `published boolean not null default
   * true` to both tables. "Published" is therefore an explicit visibility
   * flag, independent of stock (an out-of-stock product stays visible as
   * "agotado" instead of vanishing) and independent of the marketing `badge`.
   * The default `true` keeps every legacy/seed row visible without editing
   * the vendored schema.
   */
  listPublished(options: CatalogListOptions): Promise<CatalogPage>;
  /** A single published product, or null (unpublished products are hidden — 404). */
  getPublishedById(id: string): Promise<CatalogItem | null>;
}

/**
 * Promo slides reader (webshop-api/spec.md "Slides ordered"). Serves only
 * published slides in their defined order (sort_order, then creation time).
 */
export interface PromoSlideRow {
  id: string;
  eyebrow: string;
  title: string;
  text: string;
  image: string;
  primaryLabel: string | null;
  primaryHref: string | null;
  secondaryLabel: string | null;
  secondaryHref: string | null;
  sortOrder: number;
}

export interface PromoSlidesPort {
  listPublished(): Promise<PromoSlideRow[]>;
}

/* ---------------------------------------------------------------------------
 * Auth ports (PR 4; auth-identity/spec.md). Webshop identities live in the
 * `users` table; `gestion_users`/`gestion_web_access_tokens` bridge console
 * identities. Session and bridge tokens are stored ONLY as sha256 hashes.
 * ------------------------------------------------------------------------- */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  passwordHash: string;
  role: string;
  isApproved: boolean;
}

export interface SessionTokenClaims {
  userId: string;
  role: string;
}

export interface AuthPort {
  /** User matching username OR email (login identifier). */
  findByIdentifier(identifier: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  /** Creates a cliente account (is_approved = false). Throws 409 on duplicate email. */
  insertClient(input: { name: string; email: string; passwordHash: string }): Promise<AuthUser>;
  /**
   * Replaces the user's active sessions with the new one (single active
   * session per user) and stores ONLY the token hash, with expiry.
   */
  createSession(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  /** Resolves a session token hash to user claims; null when unknown/expired. */
  findSessionWithUser(tokenHash: string): Promise<SessionTokenClaims | null>;
  /** Resolves a gestion-access bridge token hash; null when unknown/expired. */
  findBridgeToken(tokenHash: string): Promise<{ webUserId: string; expiresAt: Date } | null>;
}

/** A minted checkout session (unpaid until the webhook confirms payment). */
export interface CheckoutSessionRow {
  id: string;
  userId: string;
  orderId: string;
  paymentMethodId: string | null;
  status: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CheckoutSessionsPort {
  create(input: {
    id: string;
    userId: string;
    orderId: string;
    paymentMethodId?: string | null;
    expiresAt: Date;
  }): Promise<CheckoutSessionRow>;
}

export type WebshopJson = JsonValue;