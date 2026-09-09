import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { ProductId, ServiceId } from "../../domain/shared/types.js";
import type { Product } from "../../domain/product/product.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { Service } from "../../domain/service/service.js";

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

/** Tx-bound service access; adapters own SQL, the root travels whole. */
export interface CatalogServiceStore {
  findService(tx: TxClient, id: ServiceId): Promise<Service | null>;
  saveService(tx: TxClient, service: Service): Promise<void>;
}

export interface CatalogServiceDeps {
  uow: UnitOfWork;
  services: CatalogServiceStore;
}
