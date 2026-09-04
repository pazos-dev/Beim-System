import { z } from "zod";

import { createGestionError, ERROR_CODES } from "../handlers/errors.js";
import { err, ok, type Result } from "../handlers/result.js";
import type { GestionError } from "./schemas.js";
import { JSON_STORE_ERROR_CODES, type JsonStoreError } from "./json-store.js";

export interface OwnedEntity {
  id: string;
  ownerId: string;
}

export interface RepositoryCollection<TEntity extends OwnedEntity> {
  items: TEntity[];
  version: number;
}

export interface RepositoryActor {
  hasGlobalAccess: boolean;
  id: string;
}

const REPOSITORY_AUDIT_ACTIONS = {
  CREATE: "create",
  REMOVE: "remove",
  UPDATE: "update"
} as const;

type RepositoryAuditAction = (typeof REPOSITORY_AUDIT_ACTIONS)[keyof typeof REPOSITORY_AUDIT_ACTIONS];

export interface RepositoryAuditEvent {
  action: RepositoryAuditAction;
  actorId: string;
  entityId: string;
  version: number;
}

export type RepositoryAuditSink = (event: RepositoryAuditEvent) => void;

export interface RepositoryStore<TCollection extends RepositoryCollection<OwnedEntity>> {
  read(): Promise<Result<TCollection, JsonStoreError>>;
  write(document: TCollection, expectedVersion?: number): Promise<Result<TCollection, JsonStoreError>>;
}

export interface EntityRepositoryConfig<TEntity extends OwnedEntity> {
  auditSink?: RepositoryAuditSink;
  entitySchema: z.ZodType<TEntity>;
  store: RepositoryStore<RepositoryCollection<TEntity>>;
}

function mapStoreError(error: JsonStoreError): GestionError {
  if (error.code === JSON_STORE_ERROR_CODES.CONFLICT) {
    return createGestionError(ERROR_CODES.CONFLICT);
  }
  return createGestionError(ERROR_CODES.STORAGE_ERROR);
}

function validationError(issues: z.ZodIssue[]): GestionError {
  return createGestionError(
    ERROR_CODES.VALIDATION_ERROR,
    { fields: issues.map((issue) => issue.path.join(".")) }
  );
}

function isVisible<TEntity extends OwnedEntity>(actor: RepositoryActor, entity: TEntity): boolean {
  return actor.hasGlobalAccess || entity.ownerId === actor.id;
}

export class EntityRepository<TEntity extends OwnedEntity> {
  private readonly auditSink: RepositoryAuditSink | undefined;
  private readonly entitySchema: z.ZodType<TEntity>;
  private readonly store: RepositoryStore<RepositoryCollection<TEntity>>;

  public constructor(config: EntityRepositoryConfig<TEntity>) {
    this.auditSink = config.auditSink;
    this.entitySchema = config.entitySchema;
    this.store = config.store;
  }

  public async list(actor: RepositoryActor): Promise<Result<TEntity[], GestionError>> {
    const current = await this.store.read();
    if (!current.ok) {
      return err(mapStoreError(current.error));
    }
    return ok(current.value.items.filter((entity) => isVisible(actor, entity)));
  }

  public async getById(actor: RepositoryActor, id: string): Promise<Result<TEntity, GestionError>> {
    const current = await this.store.read();
    if (!current.ok) {
      return err(mapStoreError(current.error));
    }
    const found = current.value.items.find((entity) => entity.id === id);
    if (found === undefined || !isVisible(actor, found)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async create(actor: RepositoryActor, input: unknown): Promise<Result<TEntity, GestionError>> {
    const parsed = this.entitySchema.safeParse(input);
    if (!parsed.success) {
      return err(validationError(parsed.error.issues));
    }
    const entity = parsed.data;
    if (!actor.hasGlobalAccess && entity.ownerId !== actor.id) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const current = await this.store.read();
    if (!current.ok) {
      return err(mapStoreError(current.error));
    }
    if (current.value.items.some((existing) => existing.id === entity.id)) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    const saved = await this.persist(current.value, [...current.value.items, entity], actor, {
      action: REPOSITORY_AUDIT_ACTIONS.CREATE,
      entityId: entity.id
    });
    if (!saved.ok) {
      return saved;
    }
    return ok(entity);
  }

  public async update(
    actor: RepositoryActor,
    id: string,
    input: unknown,
    expectedVersion?: number
  ): Promise<Result<TEntity, GestionError>> {
    const parsed = this.entitySchema.safeParse(input);
    if (!parsed.success) {
      return err(validationError(parsed.error.issues));
    }
    const entity = parsed.data;
    if (entity.id !== id) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    }
    if (!actor.hasGlobalAccess && entity.ownerId !== actor.id) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const current = await this.store.read();
    if (!current.ok) {
      return err(mapStoreError(current.error));
    }
    const index = current.value.items.findIndex((existing) => existing.id === id);
    const previous = current.value.items[index];
    if (previous === undefined || !isVisible(actor, previous)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    const items = [...current.value.items];
    items[index] = entity;
    const saved = await this.persist(current.value, items, actor, {
      action: REPOSITORY_AUDIT_ACTIONS.UPDATE,
      entityId: id
    }, expectedVersion);
    if (!saved.ok) {
      return saved;
    }
    return ok(entity);
  }

  public async remove(
    actor: RepositoryActor,
    id: string,
    expectedVersion?: number
  ): Promise<Result<TEntity, GestionError>> {
    const current = await this.store.read();
    if (!current.ok) {
      return err(mapStoreError(current.error));
    }
    const found = current.value.items.find((entity) => entity.id === id);
    if (found === undefined || !isVisible(actor, found)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    const items = current.value.items.filter((entity) => entity.id !== id);
    const saved = await this.persist(current.value, items, actor, {
      action: REPOSITORY_AUDIT_ACTIONS.REMOVE,
      entityId: id
    }, expectedVersion);
    if (!saved.ok) {
      return saved;
    }
    return ok(found);
  }

  private async persist(
    current: RepositoryCollection<TEntity>,
    items: TEntity[],
    actor: RepositoryActor,
    audit: { action: RepositoryAuditAction; entityId: string },
    expectedVersion?: number
  ): Promise<Result<RepositoryCollection<TEntity>, GestionError>> {
    const nextVersion = current.version + 1;
    if (this.auditSink !== undefined) {
      try {
        this.auditSink({ action: audit.action, actorId: actor.id, entityId: audit.entityId, version: nextVersion });
      } catch {
        return err(createGestionError(ERROR_CODES.AUDIT_FAILURE));
      }
    }
    // The store writes via temp file + rename and cleans the temp path on
    // failure, so a storage error here never leaves a partial document.
    const written = await this.store.write({ items, version: nextVersion }, expectedVersion);
    if (!written.ok) {
      return err(mapStoreError(written.error));
    }
    return ok(written.value);
  }
}
