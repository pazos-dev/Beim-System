/**
 * Catalog product handlers (change `clean-arch-application`, Unit 2).
 *
 * One thin function per use case: plain DTO → `UnitOfWork.run` → load
 * `ProductWithLots` for-update → one domain behavior per lane → save on the
 * same `TxClient` → commit. `venta` lots feed sales with lane pricing
 * (`salePriceOverride ?? price`); `taller` lots stay isolated for workshop
 * consume. Domain errors pass through untouched to the edge `toAppError`
 * mapping. Product has no domain rename/reprice behavior (pure refactor:
 * no new behavior here); catalog relabel/reprice live on `Service`.
 */
import { NotFoundError } from "../../domain/shared/errors.js";
import { createProductId, type ProductId } from "../../domain/shared/types.js";
import {
  createProduct,
  decrementProduct,
  restoreProduct,
  type CreateProductInput,
  type Product
} from "../../domain/product/product.js";
import {
  allocateTallerLots,
  allocateVentaLots,
  restoreLots,
  type StockLot,
  type TallerAllocation,
  type VentaAllocation
} from "../../domain/product/stock-lot.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { CatalogProductDeps } from "./ports.js";

export interface ProductIdInput {
  readonly productId: string;
}

export interface SellProductInput {
  readonly productId: string;
  readonly qty: number;
}

export interface ConsumeWorkshopInput {
  readonly productId: string;
  readonly qty: number;
}

export interface RestoreLotsInput {
  readonly productId: string;
  readonly allocations: readonly { lotId: string; qty: number }[];
}

export interface SellProductResult {
  readonly product: Product;
  readonly lots: StockLot[];
  readonly allocations: VentaAllocation[];
}

export interface ConsumeWorkshopResult {
  readonly product: Product;
  readonly lots: StockLot[];
  readonly allocations: TallerAllocation[];
}

export interface RestoreLotsResult {
  readonly product: Product;
  readonly lots: StockLot[];
}

function productNotFound(id: ProductId): NotFoundError {
  return new NotFoundError(`Producto no encontrado: ${id}`);
}

export function makeCatalogProductHandlers(deps: CatalogProductDeps) {
  const { uow, products } = deps;

  async function loadWithLots(
    tx: Parameters<Parameters<typeof uow.run>[0]>[0],
    id: ProductId
  ): Promise<ProductWithLots> {
    const found = await products.findWithLots(tx, id);
    if (found === null) throw productNotFound(id);
    return found;
  }

  return {
    async create(input: CreateProductInput): Promise<Product> {
      return uow.run(async (tx) => {
        const product = createProduct(input);
        await products.saveProduct(tx, product);
        return product;
      });
    },

    async sell(input: SellProductInput): Promise<SellProductResult> {
      const id = createProductId(input.productId);
      return uow.run(async (tx) => {
        const { product, lots } = await loadWithLots(tx, id);
        const sold = decrementProduct(product, input.qty);
        const { lots: updated, allocations } = allocateVentaLots(lots, input.qty, product.price);
        await products.saveWithLots(tx, { product: sold, lots: updated });
        return { product: sold, lots: updated, allocations };
      });
    },

    async consumeWorkshop(input: ConsumeWorkshopInput): Promise<ConsumeWorkshopResult> {
      const id = createProductId(input.productId);
      return uow.run(async (tx) => {
        const { product, lots } = await loadWithLots(tx, id);
        const { lots: updated, allocations } = allocateTallerLots(lots, input.qty);
        await products.saveWithLots(tx, { product, lots: updated });
        return { product, lots: updated, allocations };
      });
    },

    async restore(input: RestoreLotsInput): Promise<RestoreLotsResult> {
      const id = createProductId(input.productId);
      return uow.run(async (tx) => {
        const { product, lots } = await loadWithLots(tx, id);
        const updated = restoreLots(lots, input.allocations);
        const total = input.allocations.reduce((sum, allocation) => sum + allocation.qty, 0);
        const restored = restoreProduct(product, total);
        await products.saveWithLots(tx, { product: restored, lots: updated });
        return { product: restored, lots: updated };
      });
    }
  };
}
