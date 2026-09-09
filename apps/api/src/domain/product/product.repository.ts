/**
 * Product repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the `Product` root; `StockLot` children travel via the
 * root only (`findWithLots`/`saveWithLots`, same transaction). Zero
 * implementations in `domain/`.
 */
import type { ProductId } from "../shared/types.js";
import type { Product } from "./product.js";
import type { StockLot } from "./stock-lot.js";

/** Aggregate view: the `Product` root with its purpose-segregated lots. */
export interface ProductWithLots {
  readonly product: Product;
  readonly lots: readonly StockLot[];
}

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  save(product: Product): Promise<void>;
  findWithLots(id: ProductId): Promise<ProductWithLots | null>;
  saveWithLots(input: ProductWithLots): Promise<void>;
}
