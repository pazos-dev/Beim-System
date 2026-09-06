import { join } from "node:path";

import { EntityRepository, type RepositoryCollection, type RepositoryStore } from "../data/repositories";
import { JSON_STORE_ERROR_REASONS, JsonStore, type JsonStoreError } from "../data/json-store";
import {
  clientesDocumentSchema,
  clienteSchema,
  type Cliente,
  type GestionError
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import type { z } from "zod";

import type { PortActor } from "../ports/actor";
import type { ClienteRepositoryPort } from "../ports/cliente";

type ClientesDocument = z.infer<typeof clientesDocumentSchema>;

function toRepositoryActor(actor: PortActor): { hasGlobalAccess: boolean; id: string } {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

class ClientesCollectionStore implements RepositoryStore<RepositoryCollection<Cliente>> {
  private readonly inner: JsonStore<ClientesDocument>;

  public constructor(inner: JsonStore<ClientesDocument>) {
    this.inner = inner;
  }

  public async read(): Promise<Result<RepositoryCollection<Cliente>, JsonStoreError>> {
    const current = await this.inner.read();
    if (!current.ok) {
      if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) {
        return ok({ items: [], version: 0 });
      }
      return err(current.error);
    }
    return ok({ items: current.value.clientes, version: current.value.version });
  }

  public async write(
    document: RepositoryCollection<Cliente>,
    expectedVersion?: number
  ): Promise<Result<RepositoryCollection<Cliente>, JsonStoreError>> {
    const written = await this.inner.write(
      { clientes: document.items, version: document.version },
      expectedVersion
    );
    if (!written.ok) return err(written.error);
    return ok({ items: written.value.clientes, version: written.value.version });
  }
}

export class JsonClienteRepository implements ClienteRepositoryPort {
  private readonly entities: EntityRepository<Cliente>;

  public constructor(dataDirectory: string) {
    const document = new JsonStore(join(dataDirectory, "clientes.json"), clientesDocumentSchema);
    this.entities = new EntityRepository({
      entitySchema: clienteSchema,
      store: new ClientesCollectionStore(document)
    });
  }

  public async list(actor: PortActor): Promise<Result<Cliente[], GestionError>> {
    return this.entities.list(toRepositoryActor(actor));
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Cliente, GestionError>> {
    return this.entities.getById(toRepositoryActor(actor), id);
  }

  public async create(actor: PortActor, input: unknown): Promise<Result<Cliente, GestionError>> {
    return this.entities.create(toRepositoryActor(actor), input);
  }

  public async update(
    actor: PortActor,
    id: string,
    patch: unknown,
    expectedVersion: number
  ): Promise<Result<Cliente, GestionError>> {
    const current = await this.entities.getById(toRepositoryActor(actor), id);
    if (!current.ok) return err(current.error);
    if (current.value.version !== expectedVersion) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    return this.entities.update(toRepositoryActor(actor), id, patch);
  }

  public async remove(actor: PortActor, id: string): Promise<Result<void, GestionError>> {
    const removed = await this.entities.remove(toRepositoryActor(actor), id);
    if (!removed.ok) return err(removed.error);
    return ok(undefined);
  }
}
