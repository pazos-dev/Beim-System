/**
 * Composed read-only query handlers (change `clean-arch-application`,
 * Unit 11, task 5.2).
 *
 * Four thin compositions over read ports only: client with open sales,
 * catalog with per-lane availability, receipt with parts + payments,
 * cash session with movements. Children travel via their roots —
 * handlers never call mutation behaviors, never touch `UnitOfWork.run`,
 * and never remap errors: failures bubble so the edge `toAppError`
 * propagates catalog code + status (covered by Unit 12 pass-through).
 */
import { NotFoundError } from "../../domain/shared/errors.js";
import { availableTallerOf, availableVentaOf } from "../../domain/product/stock-lot.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { Product } from "../../domain/product/product.js";
import type { CashSession } from "../../domain/cash-session/cash-session.js";
import type { Receipt } from "../../domain/receipt/receipt.js";
import type { Client } from "../../domain/user/user.js";
import type { Venta } from "../../domain/venta/venta.js";
import type { ClampedPage, Paged, PageQuery, QueriesDeps } from "./ports.js";

export interface ClientWithOpenSalesInput extends PageQuery {
  readonly clientId: string;
}

export interface ClientWithOpenSales {
  readonly client: Client;
  readonly ventas: readonly Venta[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface ProductAvailability {
  readonly product: Product;
  readonly availableVenta: number;
  readonly availableTaller: number;
}

export interface CatalogAvailability {
  readonly items: readonly ProductAvailability[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface ReceiptDetailInput {
  readonly receiptId: string;
}

export interface CashSessionDetailInput {
  readonly sessionId: string;
}

/** List bounds (mirrors `src/db/pagination.ts`; application owns its clamp). 1-based page (default 1), limit 1..100 (default 20). */
export function clampPage(query: PageQuery): ClampedPage {
  const page = Math.max(query.page ?? 1, 1);
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

function withAvailability(row: ProductWithLots): ProductAvailability {
  return {
    product: row.product,
    availableVenta: availableVentaOf(row.lots),
    availableTaller: availableTallerOf(row.lots)
  };
}

export function makeQueryHandlers(deps: QueriesDeps) {
  const { clients, ventas, catalog, receipts, cash } = deps;

  return {
    async getClientWithOpenSales(input: ClientWithOpenSalesInput): Promise<ClientWithOpenSales> {
      const client = await clients.findClient(input.clientId);
      if (client === null) {
        throw new NotFoundError(`Cliente no encontrado: ${input.clientId}`);
      }
      const page = clampPage(input);
      const result: Paged<Venta> = await ventas.listOpenByClient(input.clientId, page);
      return { client, ventas: result.items, total: result.total, page: page.page, limit: page.limit };
    },

    async listCatalogWithAvailability(query: PageQuery): Promise<CatalogAvailability> {
      const page = clampPage(query);
      const result: Paged<ProductWithLots> = await catalog.listProductsWithLots(query);
      return {
        items: result.items.map(withAvailability),
        total: result.total,
        page: page.page,
        limit: page.limit
      };
    },

    async getReceiptDetail(input: ReceiptDetailInput): Promise<Receipt> {
      const found = await receipts.findReceipt(input.receiptId);
      if (found === null) {
        throw new NotFoundError(`Recibo no encontrado: ${input.receiptId}`);
      }
      return found;
    },

    async getCashSessionDetail(input: CashSessionDetailInput): Promise<CashSession> {
      const found = await cash.findCashSession(input.sessionId);
      if (found === null) {
        throw new NotFoundError(`Caja no encontrada: ${input.sessionId}`);
      }
      return found;
    }
  };
}
