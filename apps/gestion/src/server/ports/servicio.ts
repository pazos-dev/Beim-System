import type { GestionError, Servicio } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

/**
 * Servicio seam port (PR-A1a reads + A1b mutations). Reads are open to any
 * authenticated role — the adapter returns every stored row and the
 * use case applies the `q` / `active` visibility filters. Writes
 * (`create` / `update`) are admin-gated in the use case (SRV-2/SRV-3).
 */
export interface ServicioRepositoryPort {
  list(actor: PortActor): Promise<Result<Servicio[], GestionError>>;
  getById(actor: PortActor, id: string): Promise<Result<Servicio, GestionError>>;
  create(actor: PortActor, input: unknown): Promise<Result<Servicio, GestionError>>;
  update(
    actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Servicio, GestionError>>;
}
