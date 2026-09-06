import { clienteSchema, type Cliente, type GestionError } from "../server/data/schemas";
import { createGestionError, ERROR_CODES } from "../server/handlers/errors";
import { err, ok, type Result } from "../server/handlers/result";
import type { PortActor } from "../server/ports/actor";
import type { ClienteRepositoryPort } from "../server/ports/cliente";

function isVisible(actor: PortActor, entity: Cliente): boolean {
  return actor.hasGlobalAccess || entity.ownerId === actor.id;
}

function validationError(): GestionError {
  return createGestionError(ERROR_CODES.VALIDATION_ERROR);
}

export class StubApiClienteRepository implements ClienteRepositoryPort {
  private readonly items = new Map<string, Cliente>();
  private version = 0;

  public async list(actor: PortActor): Promise<Result<Cliente[], GestionError>> {
    return ok(Array.from(this.items.values()).filter((entity) => isVisible(actor, entity)));
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Cliente, GestionError>> {
    const found = this.items.get(id);
    if (found === undefined || !isVisible(actor, found)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async create(actor: PortActor, input: unknown): Promise<Result<Cliente, GestionError>> {
    const parsed = clienteSchema.safeParse(input);
    if (!parsed.success) return err(validationError());
    const entity = parsed.data;
    if (!actor.hasGlobalAccess && entity.ownerId !== actor.id) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    if (this.items.has(entity.id)) return err(createGestionError(ERROR_CODES.CONFLICT));
    this.items.set(entity.id, entity);
    this.version += 1;
    return ok(entity);
  }

  public async update(
    actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion?: number
  ): Promise<Result<Cliente, GestionError>> {
    const parsed = clienteSchema.safeParse(patch);
    if (!parsed.success || parsed.data.id !== id) return err(validationError());
    const previous = this.items.get(id);
    if (previous === undefined || !isVisible(actor, previous)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    if (!actor.hasGlobalAccess && parsed.data.ownerId !== actor.id) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    if (expectedVersion !== undefined && previous.version !== expectedVersion) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    this.items.set(id, parsed.data);
    this.version += 1;
    return ok(parsed.data);
  }

  public async remove(actor: PortActor, id: string): Promise<Result<void, GestionError>> {
    const found = this.items.get(id);
    if (found === undefined || !isVisible(actor, found)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    this.items.delete(id);
    this.version += 1;
    return ok(undefined);
  }
}
