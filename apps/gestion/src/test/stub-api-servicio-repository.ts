import { servicioSchema, type GestionError, type Servicio } from "../server/data/schemas";
import { createGestionError, ERROR_CODES } from "../server/handlers/errors";
import { err, ok, type Result } from "../server/handlers/result";
import type { PortActor } from "../server/ports/actor";
import type { ServicioRepositoryPort } from "../server/ports/servicio";

/**
 * In-memory Servicio port for the shared contract suite. Mirrors the
 * Json adapter's open-read semantic: every seeded row is visible to any
 * actor; the use case owns `q` / `active` filtering. Writes mirror the
 * Json adapter (full-entity create, OCC-guarded update) for swap tests.
 */
export class StubApiServicioRepository implements ServicioRepositoryPort {
  private readonly items = new Map<string, Servicio>();

  /** Test-only seeding; use-case tests exercise writes through the seam. */
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

  public async create(_actor: PortActor, input: unknown): Promise<Result<Servicio, GestionError>> {
    const parsed = servicioSchema.safeParse(input);
    if (!parsed.success) return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    if (this.items.has(parsed.data.id)) return err(createGestionError(ERROR_CODES.CONFLICT));
    this.items.set(parsed.data.id, parsed.data);
    return ok(parsed.data);
  }

  public async update(
    _actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Servicio, GestionError>> {
    const current = this.items.get(id);
    if (current === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    if (current.version !== expectedVersion) return err(createGestionError(ERROR_CODES.CONFLICT));
    const parsed = servicioSchema.safeParse(patch);
    if (!parsed.success || parsed.data.id !== id) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    }
    this.items.set(id, parsed.data);
    return ok(parsed.data);
  }
}
