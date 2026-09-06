import { join } from "node:path";

import { EntityRepository, type RepositoryCollection, type RepositoryStore } from "../data/repositories";
import { JSON_STORE_ERROR_REASONS, JsonStore } from "../data/json-store";
import {
  serviciosDocumentSchema,
  servicioSchema,
  type GestionError,
  type Servicio
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import type { z } from "zod";

import type { JsonStoreError } from "../data/json-store";
import type { PortActor } from "../ports/actor";
import type { ServicioRepositoryPort } from "../ports/servicio";

type ServiciosDocument = z.infer<typeof serviciosDocumentSchema>;

function toRepositoryActor(actor: PortActor): { hasGlobalAccess: boolean; id: string } {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

class ServiciosCollectionStore implements RepositoryStore<RepositoryCollection<Servicio>> {
  private readonly inner: JsonStore<ServiciosDocument>;

  public constructor(inner: JsonStore<ServiciosDocument>) {
    this.inner = inner;
  }

  public async read(): Promise<Result<RepositoryCollection<Servicio>, JsonStoreError>> {
    const current = await this.inner.read();
    if (!current.ok) {
      if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) {
        return ok({ items: [], version: 0 });
      }
      return err(current.error);
    }
    return ok({ items: current.value.servicios, version: current.value.version });
  }

  public async write(
    document: RepositoryCollection<Servicio>,
    expectedVersion?: number
  ): Promise<Result<RepositoryCollection<Servicio>, JsonStoreError>> {
    const written = await this.inner.write(
      { servicios: document.items, version: document.version },
      expectedVersion
    );
    if (!written.ok) return err(written.error);
    return ok({ items: written.value.servicios, version: written.value.version });
  }
}

/**
 * JSON-backed Servicio port. Reads are intentionally ownership-blind:
 * any authenticated role may read the catalog (SRV-1), so every stored
 * row is visible and the use case owns `q` / `active` filtering.
 */
export class JsonServicioRepository implements ServicioRepositoryPort {
  private readonly entities: EntityRepository<Servicio>;
  private readonly store: JsonStore<ServiciosDocument>;

  public constructor(dataDirectory: string) {
    this.store = new JsonStore(join(dataDirectory, "servicios.json"), serviciosDocumentSchema);
    this.entities = new EntityRepository({
      entitySchema: servicioSchema,
      store: new ServiciosCollectionStore(this.store)
    });
  }

  public async list(_actor: PortActor): Promise<Result<Servicio[], GestionError>> {
    const current = await this.store.read();
    if (!current.ok) {
      if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) return ok([]);
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }
    return ok(current.value.servicios);
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<Servicio, GestionError>> {
    const current = await this.store.read();
    if (!current.ok) {
      if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) {
        return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
      }
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }
    const found = current.value.servicios.find((servicio) => servicio.id === id);
    if (found === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    return ok(found);
  }

  public async create(actor: PortActor, input: unknown): Promise<Result<Servicio, GestionError>> {
    return this.entities.create(toRepositoryActor(actor), input);
  }

  public async update(
    actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Servicio, GestionError>> {
    const current = await this.entities.getById(toRepositoryActor(actor), id);
    if (!current.ok) return err(current.error);
    if (current.value.version !== expectedVersion) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    return this.entities.update(toRepositoryActor(actor), id, patch);
  }
}
