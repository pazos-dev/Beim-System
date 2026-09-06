import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  createServicioInputSchema,
  SERVICIO_WRITE_ROLES,
  toggleServicioInputSchema,
  updateServicioInputSchema,
  type CreateServicioInput,
  type UpdateServicioInput
} from "../../lib/domain/services/servicio";
import {
  servicioSchema,
  type GestionError,
  type Servicio
} from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../handlers/audit";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { ServicioRepositoryPort } from "../ports/servicio";

export interface ServicioActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toServicioActor(auth: AuthActor): ServicioActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

function toPortActor(actor: ServicioActor): PortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

export const servicioListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type ServicioListQuery = z.infer<typeof servicioListQuerySchema>;
export type ServicioVisibility = ServicioListQuery["active"];

export interface ServicioListItem {
  active: boolean;
  displayName: string;
  id: string;
  price: number;
  version: number;
}

export interface ServicioListResponse {
  items: ServicioListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

function toListItem(servicio: Servicio): ServicioListItem {
  return {
    active: servicio.active,
    displayName: servicio.displayName,
    id: servicio.id,
    price: servicio.price,
    version: servicio.version
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

function servicioMatchesQuery(servicio: Servicio, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return true;
  return servicio.displayName.toLowerCase().includes(wanted);
}

function isVisible(servicio: Servicio, active: ServicioVisibility): boolean {
  if (active === "all") return true;
  if (active === "true") return servicio.active;
  return !servicio.active;
}

export class ServicioUseCases {
  private readonly audit: AuditRepository;
  private readonly idempotency: IdempotencyService;
  private readonly port: ServicioRepositoryPort;

  public constructor(
    port: ServicioRepositoryPort,
    audit: AuditRepository,
    idempotency: IdempotencyService
  ) {
    this.port = port;
    this.audit = audit;
    this.idempotency = idempotency;
  }

  public async list(
    actor: ServicioActor,
    query: ServicioListQuery
  ): Promise<Result<ServicioListResponse, GestionError>> {
    const listed = await this.port.list(toPortActor(actor));
    if (!listed.ok) return err(listed.error);
    const filtered = listed.value.filter(
      (servicio) => isVisible(servicio, query.active) && (query.q === undefined || servicioMatchesQuery(servicio, query.q))
    );
    const totalItems = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize).map(toListItem);
    return ok({ items, page: query.page, pageSize: query.pageSize, totalItems });
  }

  public async getById(
    actor: ServicioActor,
    id: string,
    active: ServicioVisibility = "true"
  ): Promise<Result<Servicio, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const found = await this.port.getById(toPortActor(actor), id);
    if (!found.ok) return err(found.error);
    if (!isVisible(found.value, active)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found.value);
  }

  public async create(
    actor: ServicioActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<Servicio, GestionError>> {
    const parsed = createServicioInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!SERVICIO_WRITE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<Servicio>(
      idempotencyKey,
      parsed.data,
      async () => {
        effectRan = true;
        return this.createEffect(actor, parsed.data);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "servicio.create", null, result);
    }
    return result;
  }

  public async update(
    actor: ServicioActor,
    id: unknown,
    patch: unknown,
    expectedVersion: unknown,
    idempotencyKey: unknown
  ): Promise<Result<Servicio, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["expectedVersion"] }));
    }
    const parsed = updateServicioInputSchema.safeParse(patch);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!SERVICIO_WRITE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<Servicio>(
      idempotencyKey,
      { id, patch: parsed.data, expectedVersion },
      async () => {
        effectRan = true;
        return this.updateEffect(actor, id, parsed.data, expectedVersion);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "servicio.update", id, result);
    }
    return result;
  }

  public async toggleActive(
    actor: ServicioActor,
    id: unknown,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<Servicio, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const parsed = toggleServicioInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(parsed.error.issues));
    if (!SERVICIO_WRITE_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<Servicio>(
      idempotencyKey,
      { id, patch: { active: parsed.data.active }, expectedVersion: parsed.data.expectedVersion },
      async () => {
        effectRan = true;
        return this.updateEffect(
          actor,
          id,
          { active: parsed.data.active },
          parsed.data.expectedVersion
        );
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "servicio.update", id, result);
    }
    return result;
  }

  private async createEffect(
    actor: ServicioActor,
    data: CreateServicioInput
  ): Promise<Result<Servicio, GestionError>> {
    const parsed = servicioSchema.safeParse({
      active: true,
      displayName: data.displayName,
      id: `s_${randomUUID()}`,
      ownerId: actor.id,
      price: data.price,
      version: 0
    });
    if (!parsed.success) {
      return this.auditOutcome(
        actor.id,
        "servicio.create",
        null,
        err(validationError(parsed.error.issues))
      );
    }
    const created = await this.port.create(toPortActor(actor), parsed.data);
    if (!created.ok) return this.auditOutcome(actor.id, "servicio.create", null, created);
    return this.auditOutcome(actor.id, "servicio.create", created.value.id, ok(created.value));
  }

  private async updateEffect(
    actor: ServicioActor,
    id: string,
    patch: UpdateServicioInput,
    expectedVersion: number
  ): Promise<Result<Servicio, GestionError>> {
    const portActor = toPortActor(actor);
    const current = await this.port.getById(portActor, id);
    if (!current.ok) return this.auditOutcome(actor.id, "servicio.update", id, current);
    if (current.value.version !== expectedVersion) {
      return this.auditOutcome(actor.id, "servicio.update", id, err(conflict()));
    }
    const definedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    const next: Servicio = {
      ...current.value,
      ...definedPatch,
      id: current.value.id,
      ownerId: current.value.ownerId,
      version: current.value.version + 1
    };
    const updated = await this.port.update(portActor, id, next, expectedVersion);
    if (!updated.ok) return this.auditOutcome(actor.id, "servicio.update", id, updated);
    return this.auditOutcome(actor.id, "servicio.update", id, ok(updated.value));
  }

  private async auditOutcome<T>(
    actorId: string,
    accion: string,
    entidadId: string | null,
    outcome: Result<T, GestionError>
  ): Promise<Result<T, GestionError>> {
    const appended = await this.audit.append(
      buildAuditEvent(
        { actorId, accion, entidad: "servicio", entidadId },
        outcome.ok ? "ok" : outcome.error.code
      )
    );
    if (!appended.ok) return err(appended.error);
    return outcome;
  }
}
