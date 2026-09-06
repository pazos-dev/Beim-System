import { z } from "zod";

import {
  type GestionError,
  type Servicio
} from "../data/schemas";
import { AuditRepository } from "../handlers/audit";
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
}
