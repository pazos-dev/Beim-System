import { z } from "zod";

import type { GestionError, Venta } from "../data/schemas";
import { AuditRepository } from "../handlers/audit";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { VentaRepositoryPort } from "../ports/ventas";

export interface VentaActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toVentaActor(auth: AuthActor): VentaActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

export const ventaListQuerySchema = z.object({
  estado: z.enum(["confirmada", "anulada"]).optional(),
  q: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type VentaListQuery = z.infer<typeof ventaListQuerySchema>;

export interface VentaListItem {
  estado: Venta["estado"];
  id: string;
  numero: string;
  ordenId?: string;
  total: number;
  version: number;
}

export interface VentaListResponse {
  items: VentaListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export function ventaMatchesQuery(venta: { numero: string }, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return true;
  return venta.numero.toLowerCase().includes(wanted);
}

function toListItem(venta: Venta): VentaListItem {
  return {
    estado: venta.estado,
    id: venta.id,
    numero: venta.numero,
    ...(venta.ordenId === undefined ? {} : { ordenId: venta.ordenId }),
    total: venta.total,
    version: venta.version
  };
}

export class VentaUseCases {
  private readonly audit: AuditRepository;
  private readonly idempotency: IdempotencyService;
  private readonly port: VentaRepositoryPort;

  public constructor(
    port: VentaRepositoryPort,
    audit: AuditRepository,
    idempotency: IdempotencyService
  ) {
    this.port = port;
    this.audit = audit;
    this.idempotency = idempotency;
  }

  public async list(
    actor: PortActor,
    query: VentaListQuery
  ): Promise<Result<VentaListResponse, GestionError>> {
    const listed = await this.port.list(actor);
    if (!listed.ok) return err(listed.error);
    const filtered = listed.value.filter((venta) => {
      if (query.estado !== undefined && venta.estado !== query.estado) return false;
      if (query.q !== undefined && !ventaMatchesQuery(venta, query.q)) return false;
      return true;
    });
    filtered.sort((a, b) => a.numero.localeCompare(b.numero));
    const totalItems = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    const items = filtered.slice(start, start + query.pageSize).map(toListItem);
    return ok({ items, page: query.page, pageSize: query.pageSize, totalItems });
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Venta, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    return this.port.getById(actor, id);
  }
}
