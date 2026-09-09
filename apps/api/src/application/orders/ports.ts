import type {
  Clock,
  PaymentGatewayPort,
  TxClient,
  UnitOfWork,
  Uuid
} from "../../domain/shared/ports.js";
import type { ProductId } from "../../domain/shared/types.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { Venta } from "../../domain/venta/venta.js";
import type { Pago } from "../../domain/pago/pago.js";

/**
 * Locked product reads. Check-not-reserve by construction: no save path,
 * so stock cannot persist through this port even by accident.
 */
export interface OrderProductStore {
  findWithLots(tx: TxClient, id: ProductId): Promise<ProductWithLots | null>;
}

/** Venta persistence; `CheckoutSession` children travel via the root. */
export interface OrderVentaStore {
  findById(tx: TxClient, id: string): Promise<Venta | null>;
  save(tx: TxClient, venta: Venta): Promise<void>;
}

/** Preference projection; every mint overwrites the stored id. */
export interface OrderPagoStore {
  save(tx: TxClient, pago: Pago): Promise<void>;
}

export interface OrderDeps {
  uow: UnitOfWork;
  products: OrderProductStore;
  ventas: OrderVentaStore;
  pagos: OrderPagoStore;
  gateway: PaymentGatewayPort;
  clock: Clock;
  uuid: Uuid;
}
