import type { Cliente, GestionError } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

export interface ClienteRepositoryPort {
  create(actor: PortActor, input: unknown): Promise<Result<Cliente, GestionError>>;
  getById(actor: PortActor, id: string): Promise<Result<Cliente, GestionError>>;
  list(actor: PortActor): Promise<Result<Cliente[], GestionError>>;
  remove(actor: PortActor, id: string): Promise<Result<void, GestionError>>;
  update(
    actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Cliente, GestionError>>;
}
