import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { ProductId } from "../../domain/shared/types.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { Venta } from "../../domain/venta/venta.js";

/** Tx-bound product access; `findWithLots` locks rows FOR UPDATE. */
export interface SalesProductStore {
  findWithLots(tx: TxClient, id: ProductId): Promise<ProductWithLots | null>;
  saveWithLots(tx: TxClient, input: ProductWithLots): Promise<void>;
}

/** Tx-bound venta persistence; the aggregate travels as one root. */
export interface SalesVentaStore {
  save(tx: TxClient, venta: Venta): Promise<void>;
}

export interface SalesBatchDeps {
  uow: UnitOfWork;
  products: SalesProductStore;
  ventas: SalesVentaStore;
}
