import type { CashSession } from "../../domain/cash-session/cash-session.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { Receipt } from "../../domain/receipt/receipt.js";
import type { Client } from "../../domain/user/user.js";
import type { Venta } from "../../domain/venta/venta.js";

/**
 * Read-only query ports (change `clean-arch-application`, Unit 11).
 *
 * No transaction: queries never write, so they compose outside
 * `UnitOfWork.run`. Adapters own SQL; offset travels precomputed.
 * Framework-free: zero `express`/`pg`/`zod`/SDK imports.
 */

/** Unclamped list input; the handler applies the 1/20/max-100 contract. */
export interface PageQuery {
  readonly page?: number;
  readonly limit?: number;
}

/** Clamped page handed to adapters; offset derives from clamped values. */
export interface ClampedPage {
  readonly page: number;
  readonly limit: number;
  readonly offset: number;
}

export interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface QueriesClientReader {
  findClient(id: string): Promise<Client | null>;
}

export interface QueriesVentaReader {
  listOpenByClient(clientId: string, page: ClampedPage): Promise<Paged<Venta>>;
}

export interface QueriesCatalogReader {
  listProductsWithLots(query: PageQuery): Promise<Paged<ProductWithLots>>;
}

export interface QueriesReceiptReader {
  findReceipt(id: string): Promise<Receipt | null>;
}

export interface QueriesCashReader {
  findCashSession(id: string): Promise<CashSession | null>;
}

export interface QueriesDeps {
  clients: QueriesClientReader;
  ventas: QueriesVentaReader;
  catalog: QueriesCatalogReader;
  receipts: QueriesReceiptReader;
  cash: QueriesCashReader;
}
