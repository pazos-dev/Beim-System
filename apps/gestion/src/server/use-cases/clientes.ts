import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  CLIENTE_HARD_REMOVE_ROLES,
  CLIENTE_WRITE_ROLES,
  clienteMatchesQuery,
  createClienteInputSchema,
  findDuplicateContact,
  type CreateClienteInput,
  type DuplicateContactField
} from "../../lib/domain/clients/cliente";
import {
  clienteSchema,
  type Cliente,
  type GestionError
} from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../handlers/audit";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { ClienteRepositoryPort } from "../ports/cliente";

export interface ClienteActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toClienteActor(auth: AuthActor): ClienteActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

function toPortActor(actor: ClienteActor): PortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

export const clienteListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type ClienteListQuery = z.infer<typeof clienteListQuerySchema>;

export const updateClienteInputSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  document: z.string().trim().min(1).max(40).optional(),
  phone: z.string().min(1).max(40).optional(),
  email: z.email().optional(),
  active: z.boolean().optional()
});

export type UpdateClienteInput = z.infer<typeof updateClienteInputSchema>;

export interface ClienteListItem {
  active: boolean;
  displayName: string;
  document?: string;
  email?: string;
  id: string;
  phone?: string;
  version: number;
}

export interface ClienteListResponse {
  items: ClienteListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export interface CreateClienteResponse {
  cliente: Cliente;
  duplicateWarning?: DuplicateContactField;
}

function toListItem(cliente: Cliente): ClienteListItem {
  return {
    active: cliente.active,
    displayName: cliente.displayName,
    document: cliente.document,
    email: cliente.email,
    id: cliente.id,
    phone: cliente.phone,
    version: cliente.version
  };
}

function validationError(issues: z.ZodIssue[]): GestionError {
  return createGestionError(ERROR_CODES.VALIDATION_ERROR, {
    fields: issues.map((issue) => issue.path.join("."))
  });
}

function forbidden(): GestionError {
  return createGestionError(ERROR_CODES.FORBIDDEN);
}

function conflict(): GestionError {
  return createGestionError(ERROR_CODES.CONFLICT);
}

export class ClienteUseCases {
  private readonly audit: AuditRepository;
  private readonly idempotency: IdempotencyService;
  private readonly port: ClienteRepositoryPort;

  public constructor(
    port: ClienteRepositoryPort,
    audit: AuditRepository,
    idempotency: IdempotencyService
  ) {
    this.port = port;
    this.audit = audit;
    this.idempotency = idempotency;
  }

  public async list(
    actor: PortActor,
    query: ClienteListQuery
  ): Promise<Result<ClienteListResponse, GestionError>> {
    const listed = await this.port.list(actor);
    if (!listed.ok) return err(listed.error);
    const filtered = listed.value.filter((cliente) => {
      if (query.active === "true" && !cliente.active) return false;
      if (query.active === "false" && cliente.active) return false;
      if (query.q !== undefined && !clienteMatchesQuery(cliente, query.q)) return false;
      return true;
    });
    const totalItems = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize).map(toListItem);
    return ok({ items, page: query.page, pageSize: query.pageSize, totalItems });
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Cliente, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    return this.port.getById(actor, id);
  }

  public async create(
    actor: ClienteActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<CreateClienteResponse, GestionError>> {
    const parsed = createClienteInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!CLIENTE_WRITE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<CreateClienteResponse>(
      idempotencyKey,
      parsed.data,
      async () => {
        effectRan = true;
        return this.createEffect(actor, parsed.data);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "cliente.create", null, result);
    }
    return result;
  }

  public async update(
    actor: ClienteActor,
    id: unknown,
    patch: unknown,
    expectedVersion: unknown,
    idempotencyKey: unknown
  ): Promise<Result<Cliente, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["expectedVersion"] }));
    }
    const parsed = updateClienteInputSchema.safeParse(patch);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!CLIENTE_WRITE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<Cliente>(
      idempotencyKey,
      { id, patch: parsed.data, expectedVersion },
      async () => {
        effectRan = true;
        return this.updateEffect(actor, id, parsed.data, expectedVersion);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "cliente.update", id, result);
    }
    return result;
  }

  public async remove(
    actor: ClienteActor,
    id: unknown,
    idempotencyKey: unknown
  ): Promise<Result<void, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    if (!CLIENTE_HARD_REMOVE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<void>(
      idempotencyKey,
      { id },
      async () => {
        effectRan = true;
        const removed = await this.port.remove(toPortActor(actor), id);
        if (!removed.ok) return this.auditOutcome(actor.id, "cliente.remove", id, removed);
        return this.auditOutcome(actor.id, "cliente.remove", id, ok(undefined));
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "cliente.remove", id, result);
    }
    return result;
  }

  private async createEffect(
    actor: ClienteActor,
    data: CreateClienteInput
  ): Promise<Result<CreateClienteResponse, GestionError>> {
    const portActor = toPortActor(actor);
    const visible = await this.port.list(portActor);
    if (!visible.ok) return this.auditOutcome(actor.id, "cliente.create", null, visible);
    const duplicateWarning = findDuplicateContact(visible.value, {
      email: data.email,
      phone: data.phone
    });
    const parsed = clienteSchema.safeParse({
      active: true,
      displayName: data.displayName,
      document: data.document,
      email: data.email,
      id: `c_${randomUUID()}`,
      ownerId: actor.id,
      phone: data.phone,
      version: 0
    });
    if (!parsed.success) {
      return this.auditOutcome(
        actor.id,
        "cliente.create",
        null,
        err(validationError(parsed.error.issues))
      );
    }
    const created = await this.port.create(portActor, parsed.data);
    if (!created.ok) return this.auditOutcome(actor.id, "cliente.create", null, created);
    const response: CreateClienteResponse =
      duplicateWarning === undefined
        ? { cliente: created.value }
        : { cliente: created.value, duplicateWarning };
    return this.auditOutcome(actor.id, "cliente.create", created.value.id, ok(response));
  }

  private async updateEffect(
    actor: ClienteActor,
    id: string,
    patch: UpdateClienteInput,
    expectedVersion: number
  ): Promise<Result<Cliente, GestionError>> {
    const portActor = toPortActor(actor);
    const current = await this.port.getById(portActor, id);
    if (!current.ok) return this.auditOutcome(actor.id, "cliente.update", id, current);
    if (current.value.version !== expectedVersion) {
      return this.auditOutcome(actor.id, "cliente.update", id, err(conflict()));
    }
    const definedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    const next: Cliente = {
      ...current.value,
      ...definedPatch,
      id: current.value.id,
      ownerId: current.value.ownerId,
      version: current.value.version + 1
    };
    const updated = await this.port.update(portActor, id, next, expectedVersion);
    if (!updated.ok) return this.auditOutcome(actor.id, "cliente.update", id, updated);
    return this.auditOutcome(actor.id, "cliente.update", id, ok(updated.value));
  }

  private async auditOutcome<T>(
    actorId: string,
    accion: string,
    entidadId: string | null,
    outcome: Result<T, GestionError>
  ): Promise<Result<T, GestionError>> {
    const appended = await this.audit.append(
      buildAuditEvent(
        { actorId, accion, entidad: "cliente", entidadId },
        outcome.ok ? "ok" : outcome.error.code
      )
    );
    if (!appended.ok) return err(appended.error);
    return outcome;
  }
}
