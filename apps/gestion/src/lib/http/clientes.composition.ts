// Client backend choice for the clientes vertical: the HTTP adapter against
// `/api/v1` (Bearer identity via `api-fetch`, token from the memory-only
// session slice). `JsonClienteRepository` is intentionally NOT removed — the
// type alias below keeps the rollback import live without pulling the
// node-only store into the client bundle (`import type` is fully erased).
//
// Rollback (revert this binding only, no data touched):
//   return new JsonClienteRepository(dataDirectory);

import type { ClienteRepositoryPort } from "../../server/clientes/cliente-port";
import type { JsonClienteRepository } from "../../server/clientes/json-cliente-repository";

import { HttpClienteRepository } from "./http-cliente-repository";

export type ClienteRepositoryRollback = JsonClienteRepository;

export function createClienteRepository(): ClienteRepositoryPort {
  return new HttpClienteRepository();
}
