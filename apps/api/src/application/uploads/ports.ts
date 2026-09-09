import type { StoragePort, TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { ProductId } from "../../domain/shared/types.js";
import type { Product } from "../../domain/product/product.js";

/** Tx-bound product access; adapters own SQL, the root travels whole. */
export interface UploadProductStore {
  findProduct(tx: TxClient, id: ProductId): Promise<Product | null>;
  saveProduct(tx: TxClient, product: Product): Promise<void>;
}

/** Stored upload result replayed on idempotency-Key retry. */
export interface StoredUploadResult {
  readonly url: string;
  readonly filename: string;
  readonly bytes: number;
}

/** Tx-bound idempotency ledger; `findByKey` backs replay without rewrite. */
export interface UploadIdempotencyStore {
  findByKey(tx: TxClient, key: string): Promise<StoredUploadResult | null>;
  save(tx: TxClient, key: string, result: StoredUploadResult): Promise<void>;
}

export interface UploadDeps {
  uow: UnitOfWork;
  products: UploadProductStore;
  storage: StoragePort;
  idempotency: UploadIdempotencyStore;
}
