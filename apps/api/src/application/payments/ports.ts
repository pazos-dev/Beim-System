import type {
  Clock,
  PaymentGatewayPort,
  TxClient,
  UnitOfWork,
  WebhookVerifierPort
} from "../../domain/shared/ports.js";
import type { Pago } from "../../domain/pago/pago.js";
import type { WebhookEvent } from "../../domain/pago/webhook-event.js";
import type { Venta } from "../../domain/venta/venta.js";

/** Tx-bound venta access; webhook path flips `Pendiente` → `Pagada`. */
export interface PaymentVentaStore {
  findById(tx: TxClient, id: string): Promise<Venta | null>;
  save(tx: TxClient, venta: Venta): Promise<void>;
}

/** Tx-bound preference projection; mint always overwrites the stored id. */
export interface PaymentPagoStore {
  save(tx: TxClient, pago: Pago): Promise<void>;
}

/** Tx-bound delivery ledger; `findByKey` backs first-insert-wins dedup. */
export interface PaymentWebhookStore {
  findByKey(tx: TxClient, provider: string, eventId: string): Promise<WebhookEvent | null>;
  save(tx: TxClient, event: WebhookEvent): Promise<void>;
}

export interface PaymentDeps {
  uow: UnitOfWork;
  ventas: PaymentVentaStore;
  pagos: PaymentPagoStore;
  webhooks: PaymentWebhookStore;
  gateway: PaymentGatewayPort;
  verifier: WebhookVerifierPort;
  clock: Clock;
}
