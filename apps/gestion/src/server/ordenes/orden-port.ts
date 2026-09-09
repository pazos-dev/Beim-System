// Maps brief `ports/orden-port.ts` to the flat `src/server/ordenes/*` layout
// (slice-1 precedent: flat files win over a ports/adapters tree to keep the
// grep checklist and review budget intact).
// Frozen sources (read-only, pinned): `orders-handler.ts` (view types),
// `data/schemas.ts` (Orden/GestionError), `lib/domain/orders/orden.ts` (input).
import type { OrderRole } from "../../lib/domain/orders/order-roles";
import type { GestionError, Orden } from "../data/schemas";
import type { PortActor } from "../shared/actor";
import type { Result } from "../shared/result";
import type { OrderListResponse, OrderListViewQuery } from "./orders-handler";

export interface OrdenPortActor extends PortActor {
  role: OrderRole;
}

export interface OrdenRepositoryPort {
  list(actor: OrdenPortActor, query: OrderListViewQuery): Promise<Result<OrderListResponse, GestionError>>;
  getById(actor: PortActor, id: string): Promise<Result<Orden, GestionError>>;
  create(actor: OrdenPortActor, input: unknown): Promise<Result<Orden, GestionError>>;
}
