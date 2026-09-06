import type { GestionError, Servicio } from "../server/data/schemas";
import { createGestionError, ERROR_CODES } from "../server/handlers/errors";
import { err, ok, type Result } from "../server/handlers/result";
import type { PortActor } from "../server/ports/actor";
import type { ServicioRepositoryPort } from "../server/ports/servicio";

/**
 * In-memory Servicio port for the shared contract suite. Mirrors the
 * Json adapter's open-read semantic: every seeded row is visible to any
 * actor; the use case owns `q` / `active` filtering.
 */
export class StubApiServicioRepository implements ServicioRepositoryPort {
  private readonly items = new Map<string, Servicio>();

  /** Test-only seeding; production writes arrive in A1b. */
  public seed(rows: Servicio[]): void {
    for (const row of rows) this.items.set(row.id, row);
  }

  public async list(_actor: PortActor): Promise<Result<Servicio[], GestionError>> {
    return ok(Array.from(this.items.values()));
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<Servicio, GestionError>> {
    const found = this.items.get(id);
    if (found === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    return ok(found);
  }
}
