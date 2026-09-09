import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { ProductId } from "../../domain/shared/types.js";
import type { Product } from "../../domain/product/product.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";

/** Tx-bound product access; adapters own SQL, lots travel via the root only. */
export interface CatalogProductStore {
  findProduct(tx: TxClient, id: ProductId): Promise<Product | null>;
  findWithLots(tx: TxClient, id: ProductId): Promise<ProductWithLots | null>;
  saveProduct(tx: TxClient, product: Product): Promise<void>;
  saveWithLots(tx: TxClient, input: ProductWithLots): Promise<void>;
}

export interface CatalogProductDeps {
  uow: UnitOfWork;
  products: CatalogProductStore;
}
