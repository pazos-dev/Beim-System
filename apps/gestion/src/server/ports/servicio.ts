import type { GestionError, Servicio } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

/**
 * Read side of the Servicio seam (PR-A1a). Reads are open to any
 * authenticated role — the adapter returns every stored row and the
 * use case applies the `q` / `active` visibility filters.
 * Mutation methods (`create` / `update` / `toggleActive`) land in A1b.
 */
export interface ServicioRepositoryPort {
  list(actor: PortActor): Promise<Result<Servicio[], GestionError>>;
  getById(actor: PortActor, id: string): Promise<Result<Servicio, GestionError>>;
}
