import { join } from "node:path";

import { z } from "zod";

import { JsonStore, JSON_STORE_ERROR_REASONS, type JsonStoreError } from "../data/json-store";
import {
  auditDocumentSchema,
  clientesDocumentSchema,
  idempotencyDocumentSchema,
  movimientosStockDocumentSchema,
  ordenesDocumentSchema,
  ordenSchema,
  productosDocumentSchema,
  ventasDocumentSchema,
  type GestionError,
  type Orden
} from "../data/schemas";
import { AuditRepository } from "./audit";
import type { AuthActor, Role } from "./auth";
import { createGestionError, ERROR_CODES } from "./errors";
import { IdempotencyService } from "./idempotency";
import {
  EntityRepository,
  type RepositoryActor,
  type RepositoryCollection,
  type RepositoryStore
} from "../data/repositories";
import { err, ok, type Result } from "./result";

export interface OrderActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toOrderActor(auth: AuthActor): OrderActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

export function toRepositoryActor(actor: OrderActor): RepositoryActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

export { ORDER_CREATE_ROLES } from "../../lib/domain/orders/order-roles";

export const ORDER_TRANSITION_ROLES: ReadonlySet<Role> = new Set([
  "tecnico",
  "administrador",
  "administrador_principal"
]);

export const ORDER_PAYMENT_ROLES: ReadonlySet<Role> = new Set([
  "caja",
  "administrador",
  "administrador_principal"
]);

export type OrdenesDocument = z.infer<typeof ordenesDocumentSchema>;
export type ClientesDocument = z.infer<typeof clientesDocumentSchema>;
export type ProductosDocument = z.infer<typeof productosDocumentSchema>;
export type VentasDocument = z.infer<typeof ventasDocumentSchema>;
export type MovimientosStockDocument = z.infer<typeof movimientosStockDocumentSchema>;

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

export interface OrderStores {
  audit: AuditRepository;
  clientes: JsonStore<ClientesDocument>;
  idempotency: IdempotencyService;
  movimientos: JsonStore<MovimientosStockDocument>;
  ordenes: EntityRepository<Orden>;
  ordenesDocument: JsonStore<OrdenesDocument>;
  productos: JsonStore<ProductosDocument>;
  ventas: JsonStore<VentasDocument>;
}

export function createOrderStores(dataDirectory: string): OrderStores {
  const ordenesDocument = new JsonStore(join(dataDirectory, "ordenes.json"), ordenesDocumentSchema);
  return {
    audit: new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    clientes: new JsonStore(join(dataDirectory, "clientes.json"), clientesDocumentSchema),
    idempotency: new IdempotencyService(
      new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema)
    ),
    movimientos: new JsonStore(
      join(dataDirectory, "movimientos-stock.json"),
      movimientosStockDocumentSchema
    ),
    ordenes: new EntityRepository({
      entitySchema: ordenSchema,
      store: new OrdenesCollectionStore(ordenesDocument)
    }),
    ordenesDocument,
    productos: new JsonStore(join(dataDirectory, "productos.json"), productosDocumentSchema),
    ventas: new JsonStore(join(dataDirectory, "ventas.json"), ventasDocumentSchema)
  };
}

export function orderValidationError(issues: z.ZodIssue[]): GestionError {
  return createGestionError(ERROR_CODES.VALIDATION_ERROR, {
    fields: issues.map((issue) => issue.path.join("."))
  });
}

export function mapStoreError(error: JsonStoreError): GestionError {
  if (error.code === "CONFLICT") return createGestionError(ERROR_CODES.CONFLICT);
  return createGestionError(ERROR_CODES.STORAGE_ERROR);
}

export function emptyOrdenes(): OrdenesDocument {
  return { ordenes: [], version: 0 };
}

export function emptyProductos(): ProductosDocument {
  return { productos: [], version: 0 };
}

export function emptyVentas(): VentasDocument {
  return { ventas: [], version: 0 };
}

export function emptyMovimientos(): MovimientosStockDocument {
  return { movimientosStock: [], version: 0 };
}

export async function readOrEmpty<T extends { version: number }>(
  store: JsonStore<T>,
  fallback: T
): Promise<Result<T, GestionError>> {
  const current = await store.read();
  if (current.ok) return current;
  if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) return ok(fallback);
  return err(mapStoreError(current.error));
}

export async function restoreDocument<T extends { version: number }>(
  store: JsonStore<T>,
  snapshot: T
): Promise<void> {
  const current = await store.read();
  if (!current.ok) return;
  await store.write({ ...snapshot, version: current.value.version + 1 }, current.value.version);
}

export async function rollbackSteps(rollbacks: Array<() => Promise<void>>): Promise<void> {
  for (const restoreStep of rollbacks.reverse()) {
    try {
      await restoreStep();
    } catch {
      continue;
    }
  }
}
