// Maps brief `use-cases/orden-use-cases.ts` to the flat `src/server/ordenes/*`
// layout (slice-1 precedent). Pure delegation over `OrdenRepositoryPort`:
// no I/O, no zod boundary (the controller owns it), no store access.
// Frozen sources (read-only, pinned): `ORDER_CREATE_ROLES` preserved from
// `shared/order-context.ts`; view types from `orders-handler.ts`.
import type { GestionError, Orden } from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";
import { ORDER_CREATE_ROLES, type OrderActor } from "../shared/order-context";
import type { OrderListResponse, OrderListViewQuery } from "./orders-handler";
import type { OrdenPortActor, OrdenRepositoryPort } from "./orden-port";

function toPortActor(actor: OrderActor): PortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

function toOrdenPortActor(actor: OrderActor): OrdenPortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id, role: actor.role };
}

export class OrdenUseCases {
  private readonly port: OrdenRepositoryPort;

  public constructor(port: OrdenRepositoryPort) {
    this.port = port;
  }

  public async list(
    actor: OrderActor,
    query: OrderListViewQuery
  ): Promise<Result<OrderListResponse, GestionError>> {
    return this.port.list(toOrdenPortActor(actor), query);
  }

  public async getById(actor: OrderActor, id: string): Promise<Result<Orden, GestionError>> {
    return this.port.getById(toPortActor(actor), id);
  }

  public async create(actor: OrderActor, input: unknown): Promise<Result<Orden, GestionError>> {
    if (!ORDER_CREATE_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    return this.port.create(toOrdenPortActor(actor), input);
  }
}
