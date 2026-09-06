import { z } from "zod";

import type { GestionError, Venta } from "../data/schemas";
import { ventaDescuentoSchema } from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../handlers/audit";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { guardDraftStock } from "../handlers/order-context";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { StockRepositoryPort } from "../ports/stock";
import type { VentaRepositoryPort } from "../ports/ventas";
import { SALE_CREATE_ROLES } from "../handlers/sales";

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

export const ventaCreateItemSchema = z.object({
  productoId: z.string().min(1).max(100),
  cantidad: z.number().int().positive()
});

export const ventaCreateInputSchema = z.object({
  numero: z.string().min(1).max(40).optional(),
  items: z.array(ventaCreateItemSchema).min(1),
  pagos: z
    .array(z.object({ metodo: z.enum(["efectivo", "tarjeta", "transferencia", "mixto"]), monto: z.number().min(0) }))
    .min(1),
  descuentos: z.array(ventaDescuentoSchema).max(1).optional(),
  ordenId: z.string().min(1).max(100).optional()
});

export type VentaCreateInput = z.infer<typeof ventaCreateInputSchema>;

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
  private readonly stock: StockRepositoryPort;

  public constructor(
    port: VentaRepositoryPort,
    audit: AuditRepository,
    idempotency: IdempotencyService,
    stock: StockRepositoryPort
  ) {
    this.port = port;
    this.audit = audit;
    this.idempotency = idempotency;
    this.stock = stock;
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

  public async create(
    actor: VentaActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<Venta, GestionError>> {
    const parsed = ventaCreateInputSchema.safeParse(input);
    if (!parsed.success) {
      return err(
        createGestionError(ERROR_CODES.VALIDATION_ERROR, {
          fields: parsed.error.issues.map((issue) => issue.path.join("."))
        })
      );
    }
    if (!SALE_CREATE_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    let effectRan = false;
    const result = await this.idempotency.execute<Venta>(idempotencyKey, parsed.data, async () => {
      effectRan = true;
      return this.createEffect(actor, parsed.data);
    });
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "venta.create", null, result);
    }
    return result;
  }

  private async createEffect(actor: VentaActor, data: VentaCreateInput): Promise<Result<Venta, GestionError>> {
    // The product catalog is global: price and availability resolve through
    // the shared stock port with a global read, mirroring the baseline
    // SalesHandler which reads productos.json without ownership filtering.
    const catalog: PortActor = { hasGlobalAccess: true, id: actor.id };
    const prices = new Map<string, number>();
    for (const item of data.items) {
      if (prices.has(item.productoId)) continue;
      const producto = await this.stock.getProducto(catalog, item.productoId);
      if (!producto.ok) {
        return this.auditOutcome(actor.id, "venta.create", null, err(producto.error.code === ERROR_CODES.NOT_FOUND_OR_FORBIDDEN
          ? createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["items"] })
          : producto.error));
      }
      prices.set(item.productoId, producto.value.price);
    }
    const pricedItems = data.items.map((item) => ({
      productoId: item.productoId,
      cantidad: item.cantidad,
      precio: prices.get(item.productoId) ?? 0
    }));
    const itemsTotal = pricedItems.reduce((sum, item) => sum + item.cantidad * item.precio, 0);
    const discount = data.descuentos?.[0]?.monto ?? 0;
    if (discount > itemsTotal) {
      return this.auditOutcome(
        actor.id,
        "venta.create",
        null,
        err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["descuentos"] }))
      );
    }
    const total = itemsTotal - discount;
    if (data.pagos.reduce((sum, pago) => sum + pago.monto, 0) !== total) {
      return this.auditOutcome(
        actor.id,
        "venta.create",
        null,
        err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["pagos"] }))
      );
    }
    const deltas = pricedItems.map((item) => ({ productoId: item.productoId, cantidad: item.cantidad }));
    const guarded = await guardDraftStock(
      async (productoId, cantidad) => {
        const producto = await this.stock.getProducto(catalog, productoId);
        if (!producto.ok) return err(producto.error);
        if (producto.value.stock < cantidad) {
          return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["items"] }));
        }
        return ok({ balance: producto.value.stock });
      },
      deltas
    );
    if (!guarded.ok) return this.auditOutcome(actor.id, "venta.create", null, guarded);
    const portActor: PortActor = { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
    const created = await this.port.applyCreate(      portActor,
      {
        deltas,
        draft: {
          items: pricedItems,
          pagos: data.pagos,
          total,
          ...(data.numero === undefined ? {} : { numero: data.numero }),
          ...(data.ordenId === undefined ? {} : { ordenId: data.ordenId }),
          ...(data.descuentos?.[0] === undefined ? {} : { descuento: data.descuentos[0] })
        }
      },
      async (persisted) => {
        const appended = await this.audit.append(
          buildAuditEvent(
            {
              actorId: actor.id,
              accion: "venta.create",
              entidad: "venta",
              entidadId: persisted.id,
              detalles: { numero: persisted.numero, total: persisted.total }
            },
            "ok"
          )
        );
        if (!appended.ok) return err(appended.error);
        return ok(undefined);
      }
    );
    if (!created.ok) return this.auditOutcome(actor.id, "venta.create", null, created);
    return created;
  }

  private async auditOutcome<T>(
    actorId: string,
    accion: string,
    entidadId: string | null,
    outcome: Result<T, GestionError>
  ): Promise<Result<T, GestionError>> {
    const appended = await this.audit.append(
      buildAuditEvent(
        { actorId, accion, entidad: "venta", entidadId },
        outcome.ok ? "ok" : outcome.error.code
      )
    );
    if (!appended.ok) return err(appended.error);
    return outcome;
  }
}
