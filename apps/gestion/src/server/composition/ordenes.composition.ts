// Ordenes composition: the sole backend-choosing line for the slice-2
// vertical (`const repo = new JsonOrdenRepository(dir)` lives inside the
// use-case factory below). API routes keep the frozen `OrderHandler` until
// cutover; pages were rewired to canonical `shared/*` imports only.
// Rollback: delete this file and keep pointing at `OrderHandler`.
import { JsonOrdenRepository } from "../ordenes/json-orden-repository";
import { OrdenController } from "../ordenes/orden-controller";
import { OrdenUseCases } from "../ordenes/orden-use-cases";

export function createOrdenUseCases(dataDirectory: string): OrdenUseCases {
  return new OrdenUseCases(new JsonOrdenRepository(dataDirectory));
}

export function createOrdenController(dataDirectory: string): OrdenController {
  return new OrdenController(createOrdenUseCases(dataDirectory));
}
