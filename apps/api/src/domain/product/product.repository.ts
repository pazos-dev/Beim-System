/**
 * Product repository port (domain slice, change `clean-arch-domain`).
 *
 * One interface for the `Product` root (no children in Phase 3; `StockLot`
 * arrives in Phase 3B behind this same root). Zero implementations in
 * `domain/`.
 */
import type { ProductId } from "../shared/types.js";
import type { Product } from "./product.js";

export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  save(product: Product): Promise<void>;
}
