// Maps brief `adapters/json-orden-repository.ts` to the flat
// `src/server/ordenes/*` layout (slice-1 precedent). Sole `JsonStore`
// importer for the ordenes vertical besides composition.
// Frozen sources (read-only, pinned): `orders-handler.ts` (listView/create
// envelopes), `data/schemas.ts` (orden/clientes documents), `shared/
// order-context.ts` (document helpers), `lib/domain/orders/orden.ts`.
// Documented seams (behavior-identical for sale-less orders; the API routes
// keep the frozen `OrderHandler` until cutover):
// - `sale`-bearing create inputs return VALIDATION_ERROR (fields ["sale"]);
//   sale/stock effects stay with the ventas slice until TODO(ventas-collapse)
//   collapses the three sale-creation paths.
// - Idempotent retries stay on the frozen handler path (no idempotency key on
//   the port); `nextNumber`/`ORDEN_CREADA` are documented-only, untouched.
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  EntityRepository,
  type RepositoryCollection,
  type RepositoryStore
} from "../data/repositories";
import { JsonStore, type JsonStoreError } from "../data/json-store";
import {
  auditDocumentSchema,
  clientesDocumentSchema,
  movimientosStockDocumentSchema,
  ordenSchema,
  ordenesDocumentSchema,
  productosDocumentSchema,
  type GestionError,
  type Orden
} from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../shared/audit";
import type { PortActor } from "../shared/actor";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import {
  emptyMovimientos,
  emptyOrdenes,
  emptyProductos,
  mapStoreError,
  orderValidationError,
  readOrEmpty,
  restoreDocument,
  rollbackSteps,
  type ClientesDocument,
  type MovimientosStockDocument,
  type OrdenesDocument,
  type ProductosDocument
} from "../shared/order-context";
import {
  createOrderInputSchema,
  formatEquipment,
  formatEstimatedDisplay,
  isOrderStateFilterKey,
  nextOrderNumero,
  orderFilterCounts,
  ORDER_STATUS,
  resolveOrderFilter
} from "../../lib/domain/orders/orden";
import type {
  OrderListItem,
  OrderListResponse,
  OrderListViewQuery
} from "./orders-handler";
import type { OrdenPortActor, OrdenRepositoryPort } from "./orden-port";

function toRepositoryActor(actor: PortActor): { hasGlobalAccess: boolean; id: string } {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

class OrdenesCollectionStore implements RepositoryStore<RepositoryCollection<Orden>> {
  private readonly inner: JsonStore<OrdenesDocument>;

  public constructor(inner: JsonStore<OrdenesDocument>) {
    this.inner = inner;
  }

  public async read(): Promise<Result<RepositoryCollection<Orden>, JsonStoreError>> {
    const current = await this.inner.read();
    if (!current.ok) return err(current.error);
    return ok({ items: current.value.ordenes, version: current.value.version });
  }

  public async write(
    document: RepositoryCollection<Orden>,
    expectedVersion?: number
  ): Promise<Result<RepositoryCollection<Orden>, JsonStoreError>> {
    const written = await this.inner.write(
      { ordenes: document.items, version: document.version },
      expectedVersion
    );
    if (!written.ok) return err(written.error);
    return ok({ items: written.value.ordenes, version: written.value.version });
  }
}

export class JsonOrdenRepository implements OrdenRepositoryPort {
  private readonly audit: AuditRepository;
  private readonly clientes: JsonStore<ClientesDocument>;
  private readonly entities: EntityRepository<Orden>;
  private readonly movimientos: JsonStore<MovimientosStockDocument>;
  private readonly ordenesDocument: JsonStore<OrdenesDocument>;
  private readonly productos: JsonStore<ProductosDocument>;

  public constructor(dataDirectory: string) {
    const document = new JsonStore(join(dataDirectory, "ordenes.json"), ordenesDocumentSchema);
    this.ordenesDocument = document;
    this.clientes = new JsonStore(join(dataDirectory, "clientes.json"), clientesDocumentSchema);
    this.productos = new JsonStore(join(dataDirectory, "productos.json"), productosDocumentSchema);
    this.movimientos = new JsonStore(
      join(dataDirectory, "movimientos-stock.json"),
      movimientosStockDocumentSchema
    );
    this.audit = new AuditRepository(
      new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)
    );
    this.entities = new EntityRepository({
      entitySchema: ordenSchema,
      store: new OrdenesCollectionStore(document)
    });
  }

  public async list(
    actor: OrdenPortActor,
    query: OrderListViewQuery
  ): Promise<Result<OrderListResponse, GestionError>> {
    const [ordenes, clientes] = await Promise.all([
      this.entities.list(toRepositoryActor(actor)),
      readOrEmpty(this.clientes, { clientes: [], version: 0 })
    ]);
    if (!ordenes.ok) return err(ordenes.error);
    if (!clientes.ok) return err(clientes.error);
    const clienteNombreById = new Map(
      clientes.value.clientes.map((cliente) => [cliente.id, cliente.displayName])
    );

    if (query.estado !== undefined && !isOrderStateFilterKey(query.estado)) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["estado"] }));
    }
    const estados =
      query.estado === undefined || query.estado === "todas"
        ? null
        : resolveOrderFilter(query.estado);
    const filtered =
      estados === null ? ordenes.value : ordenes.value.filter((order) => estados.has(order.estado));
    const sorted = [...filtered].sort((a, b) => {
      const direction = query.dir === "desc" ? -1 : 1;
      if (query.sort === "total") return (a.total - b.total) * direction;
      if (query.sort === "estado") return a.estado.localeCompare(b.estado) * direction;
      const aName = clienteNombreById.get(a.clienteId) ?? a.numero;
      const bName = clienteNombreById.get(b.clienteId) ?? b.numero;
      if (query.sort === "clienteNombre") return aName.localeCompare(bName) * direction;
      return a.numero.localeCompare(b.numero) * direction;
    });
    const totalItems = sorted.length;
    const start = (query.page - 1) * query.pageSize;
    const pageItems = sorted.slice(start, start + query.pageSize);
    const canViewBoleta = actor.role === "administrador_principal";
    const items: OrderListItem[] = pageItems.map((order) => ({
      boletaNumero: canViewBoleta ? order.boletaNumero : undefined,
      clienteId: order.clienteId,
      clienteNombre: clienteNombreById.get(order.clienteId) ?? "Cliente eliminado",
      equipment: formatEquipment(order),
      estado: order.estado,
      estimatedDisplay: formatEstimatedDisplay(order),
      id: order.id,
      numero: order.numero,
      paymentStatus: order.paymentStatus,
      total: order.total,
      version: order.version
    }));
    return ok({
      canViewBoleta,
      counts: orderFilterCounts(ordenes.value),
      items,
      page: query.page,
      pageSize: query.pageSize,
      totalItems
    });
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Orden, GestionError>> {
    return this.entities.getById(toRepositoryActor(actor), id);
  }

  public async create(actor: OrdenPortActor, input: unknown): Promise<Result<Orden, GestionError>> {
    const parsed = createOrderInputSchema.safeParse(input);
    if (!parsed.success) return err(orderValidationError(parsed.error.issues));
    if (parsed.data.sale !== undefined) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["sale"] }));
    }
    const data = parsed.data;
    const [ordenes, clientes, productos, movimientos] = await Promise.all([
      readOrEmpty(this.ordenesDocument, emptyOrdenes()),
      this.clientes.read(),
      readOrEmpty(this.productos, emptyProductos()),
      readOrEmpty(this.movimientos, emptyMovimientos())
    ]);
    if (!ordenes.ok) return err(ordenes.error);
    if (!clientes.ok) return err(mapStoreError(clientes.error));
    if (!productos.ok) return err(productos.error);
    if (!movimientos.ok) return err(movimientos.error);

    if (!clientes.value.clientes.some((cliente) => cliente.id === data.clienteId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN, { fields: ["clienteId"] }));
    }
    const numero = data.numero ?? nextOrderNumero(ordenes.value.ordenes.map((order) => order.numero));
    if (ordenes.value.ordenes.some((order) => order.numero === numero)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["numero"] }));
    }
    if (data.total === undefined) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["total"] }));
    }

    const candidate = ordenSchema.safeParse({
      boletaNumero: data.boletaNumero,
      clienteId: data.clienteId,
      deviceBrand: data.deviceBrand,
      deviceColor: data.deviceColor,
      deviceModel: data.deviceModel,
      estado: ORDER_STATUS.EN_DIAGNOSTICO,
      estimatedTime: data.estimatedTime,
      estimatedTimeUnit: data.estimatedTimeUnit,
      id: `o_${randomUUID()}`,
      numero,
      ownerId: actor.id,
      paymentStatus: "pendiente",
      total: data.total,
      version: 1
    });
    if (!candidate.success) return err(orderValidationError(candidate.error.issues));

    const rollbacks: Array<() => Promise<void>> = [];
    const writtenProductos = await this.productos.write(
      { productos: productos.value.productos, version: productos.value.version + 1 },
      productos.value.version
    );
    if (!writtenProductos.ok) return err(mapStoreError(writtenProductos.error));
    rollbacks.push(() => restoreDocument(this.productos, productos.value));

    const writtenMovimientos = await this.movimientos.write(
      { movimientosStock: movimientos.value.movimientosStock, version: movimientos.value.version + 1 },
      movimientos.value.version
    );
    if (!writtenMovimientos.ok) {
      await rollbackSteps(rollbacks);
      return err(mapStoreError(writtenMovimientos.error));
    }
    rollbacks.push(() => restoreDocument(this.movimientos, movimientos.value));

    const writtenOrdenes = await this.ordenesDocument.write(
      { ordenes: [...ordenes.value.ordenes, candidate.data], version: ordenes.value.version + 1 },
      ordenes.value.version
    );
    if (!writtenOrdenes.ok) {
      await rollbackSteps(rollbacks);
      return err(mapStoreError(writtenOrdenes.error));
    }

    const audited = await this.audit.append(
      buildAuditEvent(
        {
          accion: "orden.create",
          actorId: actor.id,
          detalles: { numero, ordenId: candidate.data.id },
          entidad: "orden",
          entidadId: candidate.data.id
        },
        "ok"
      )
    );
    if (!audited.ok) {
      rollbacks.push(() => restoreDocument(this.ordenesDocument, ordenes.value));
      await rollbackSteps(rollbacks);
      return err(audited.error);
    }
    return ok(candidate.data);
  }
}
