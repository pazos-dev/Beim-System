import { randomUUID } from "node:crypto";

import {
  auditEventSchema,
  type AuditEvent,
  type AuditResult,
  type GestionError,
  type AuditDocument
} from "../data/schemas";
import { JsonStore, type JsonStoreError } from "../data/json-store";
import { createGestionError, ERROR_CODES } from "./errors";
import { err, ok, type Result } from "./result";

export interface AuditContext {
  actorId: string | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalles?: Record<string, unknown>;
}

export function buildAuditEvent(context: AuditContext, resultado: AuditResult): AuditEvent {
  return {
    id: `a_${randomUUID()}`,
    actorId: context.actorId,
    accion: context.accion,
    entidad: context.entidad,
    entidadId: context.entidadId,
    instante: new Date().toISOString(),
    resultado,
    detalles: context.detalles ?? {}
  };
}

function auditFailure(): GestionError {
  return createGestionError(ERROR_CODES.AUDIT_FAILURE);
}

export class AuditRepository {
  private readonly store: JsonStore<AuditDocument>;
  private appendQueue: Promise<void> = Promise.resolve();

  public constructor(store: JsonStore<AuditDocument> | { store: JsonStore<AuditDocument> }) {
    this.store = store instanceof JsonStore ? store : store.store;
  }

  public append(event: AuditEvent): Promise<Result<AuditEvent, GestionError>> {
    const operation = this.appendQueue.then(() => this.appendSerialized(event));
    this.appendQueue = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private async appendSerialized(event: AuditEvent): Promise<Result<AuditEvent, GestionError>> {
    if (!auditEventSchema.safeParse(event).success) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    }

    const current = await this.store.read();
    if (!current.ok) {
      return err(auditFailureFromStore(current.error));
    }

    const written = await this.store.write(
      {
        version: current.value.version + 1,
        events: [...current.value.events, event]
      },
      current.value.version
    );
    if (!written.ok) {
      return err(auditFailureFromStore(written.error));
    }

    return ok(event);
  }
}

function auditFailureFromStore(_error: JsonStoreError): GestionError {
  return auditFailure();
}

export async function appendAuditEvent(
  repository: AuditRepository,
  event: AuditEvent
): Promise<Result<AuditEvent, GestionError>> {
  return repository.append(event);
}
