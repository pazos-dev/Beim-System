import { randomUUID } from "node:crypto";

import { z } from "zod";

import { weightedAverageCost, type PurchaseInput } from "../../lib/domain/inventory/inventory";
import { STOCK_WRITE_ROLES } from "../../lib/domain/inventory/stock-roles";
import {
  compraSchema,
  movimientoStockSchema,
  productoSchema,
  type Compra,
  type GestionError,
  type MovimientoStock,
  type Producto
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import {
  createAuditHook,
  forbidden,
  reportAuditOutcome,
  toPortActor,
  validationError,
  type StockActor,
  type StockEffectDeps
} from "./stock-port";

export const compraListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  proveedor: z.string().trim().min(1).max(120).optional(),
  productoId: z.string().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type CompraListQuery = z.infer<typeof compraListQuerySchema>;

export const anularCompraInputSchema = z.object({
  motivo: z.string().min(1).max(200)
});

export type AnularCompraInput = z.infer<typeof anularCompraInputSchema>;

export interface CompraListItem {
  cantidad: number;
  comprobante?: string;
  costoUnitario: number;
  fecha: string;
  id: string;
  productoId: string;
  proveedor: string;
  total: number;
}

export interface CompraListResponse {
  items: CompraListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export function toCompraListItem(compra: Compra): CompraListItem {
  return {
    cantidad: compra.cantidad,
    comprobante: compra.comprobante,
    costoUnitario: compra.costoUnitario,
    fecha: compra.fecha,
    id: compra.id,
    productoId: compra.productoId,
    proveedor: compra.proveedor,
    total: compra.total
  };
}

export async function listComprasPage(
  deps: StockEffectDeps,
  actor: StockActor,
  query: CompraListQuery
): Promise<Result<CompraListResponse, GestionError>> {
  if (!STOCK_WRITE_ROLES.has(actor.role)) return err(forbidden());
  const portActor = toPortActor(actor);
  const [compras, productos] = await Promise.all([
    deps.port.listCompras(portActor),
    deps.port.listProductos(portActor)
  ]);
  if (!compras.ok) return err(compras.error);
  if (!productos.ok) return err(productos.error);
  const names = new Map(productos.value.map((item) => [item.id, item.displayName]));
  const needle = query.q?.trim().toLowerCase();
  const filtered = compras.value.filter((compra) => {
    if (query.proveedor !== undefined && compra.proveedor.trim().toLowerCase() !== query.proveedor.toLowerCase()) {
      return false;
    }
    if (query.productoId !== undefined && compra.productoId !== query.productoId) return false;
    if (needle !== undefined && needle !== "") {
      const haystack = `${compra.proveedor} ${compra.comprobante ?? ""} ${names.get(compra.productoId) ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
  const totalItems = filtered.length;
  const start = (query.page - 1) * query.pageSize;
  return ok({
    items: filtered.slice(start, start + query.pageSize).map(toCompraListItem),
    page: query.page,
    pageSize: query.pageSize,
    totalItems
  });
}

export async function getCompraItem(
  deps: StockEffectDeps,
  actor: StockActor,
  id: string
): Promise<Result<CompraListItem, GestionError>> {
  if (!STOCK_WRITE_ROLES.has(actor.role)) return err(forbidden());
  const found = await deps.port.getCompra(toPortActor(actor), id);
  if (!found.ok) return err(found.error);
  return ok(toCompraListItem(found.value));
}

export async function anularCompraEffect(
  deps: StockEffectDeps,
  actor: StockActor,
  id: string,
  motivo: string
): Promise<Result<CompraListItem, GestionError>> {
  const portActor = toPortActor(actor);
  const found = await deps.port.getCompra(portActor, id);
  if (!found.ok) return err(found.error);
  const compra = found.value;
  const producto = await deps.port.getProducto(portActor, compra.productoId);
  if (!producto.ok) {
    return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["productoId"] }));
  }
  const movimientos = await deps.port.listMovimientos(portActor, compra.productoId);
  if (!movimientos.ok) return err(movimientos.error);
  // Safe retry by reversal check: a compra with an anulacion reversal already
  // written returns as-is with no new movements (compra doc has no estado field,
  // so the reversal is the annulled marker). Assumption: reversal mirrors the
  // entry deposito (confirm at verify).
  const alreadyAnulled = movimientos.value.some(
    (move) => move.motivo === "anulacion" && move.referencia === compra.id
  );
  if (alreadyAnulled) return ok(toCompraListItem(compra));
  if (producto.value.stock < compra.cantidad) {
    return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["cantidad"] }));
  }
  const nextStock = producto.value.stock - compra.cantidad;
  const parsedProducto = productoSchema.safeParse({
    ...producto.value,
    stock: nextStock
  });
  if (!parsedProducto.success) {
    return err(validationError(parsedProducto.error.issues));
  }
  const nextProducto: Producto = { ...parsedProducto.data, version: producto.value.version + 1 };
  const parsedMovimiento = movimientoStockSchema.safeParse({
    balanceAfter: nextStock,
    cantidad: -compra.cantidad,
    deposito: compra.deposito,
    id: `m_${randomUUID()}`,
    motivo: "anulacion",
    ownerId: actor.id,
    productoId: compra.productoId,
    referencia: compra.id,
    version: 1
  });
  if (!parsedMovimiento.success) {
    return err(validationError(parsedMovimiento.error.issues));
  }
  // Shared movement mechanism: reuse applyOutflow persistence (producto +
  // movimiento) with a compra.anular audit hook instead of stock.outflow.
  const applied = await deps.port.applyOutflow(
    portActor,
    { movimiento: parsedMovimiento.data, producto: nextProducto },
    createAuditHook(deps.audit, actor.id, "compra.anular", "compra", compra.id, {
      motivo,
      productoId: compra.productoId
    })
  );
  if (!applied.ok) return err(applied.error);
  return ok(toCompraListItem(compra));
}

export async function purchaseEffect(
  deps: StockEffectDeps,
  actor: StockActor,
  data: PurchaseInput
): Promise<Result<{ compra: Compra; movimiento: MovimientoStock; producto: Producto }, GestionError>> {
  const portActor = toPortActor(actor);
  const found = await deps.port.getProducto(portActor, data.productoId);
  if (!found.ok) return reportAuditOutcome(deps.audit, actor.id, "stock.purchase", null, found);
  const cost = weightedAverageCost(found.value.stock, found.value.cost, data.cantidad, data.costoUnitario);
  const stock = found.value.stock + data.cantidad;
  const parsedProducto = productoSchema.safeParse({ ...found.value, cost, stock });
  if (!parsedProducto.success) {
    return reportAuditOutcome(deps.audit, actor.id, "stock.purchase", found.value.id, err(validationError(parsedProducto.error.issues)));
  }
  const nextProducto: Producto = { ...parsedProducto.data, version: found.value.version + 1 };
  const compraId = `co_${randomUUID()}`;
  const parsedCompra = compraSchema.safeParse({
    cantidad: data.cantidad,
    costoUnitario: data.costoUnitario,
    comprobante: data.comprobante,
    deposito: data.deposito,
    fecha: new Date().toISOString(),
    id: compraId,
    ownerId: actor.id,
    productoId: found.value.id,
    proveedor: data.proveedor,
    total: Math.round(data.cantidad * data.costoUnitario * 100) / 100,
    version: 1
  });
  if (!parsedCompra.success) {
    return reportAuditOutcome(deps.audit, actor.id, "stock.purchase", found.value.id, err(validationError(parsedCompra.error.issues)));
  }
  const parsedMovimiento = movimientoStockSchema.safeParse({
    balanceAfter: stock,
    cantidad: data.cantidad,
    deposito: data.deposito,
    id: `m_${randomUUID()}`,
    motivo: "compra",
    ownerId: actor.id,
    productoId: found.value.id,
    referencia: compraId,
    version: 1
  });
  if (!parsedMovimiento.success) {
    return reportAuditOutcome(deps.audit, actor.id, "stock.purchase", found.value.id, err(validationError(parsedMovimiento.error.issues)));
  }
  return deps.port.applyPurchase(
    portActor,
    { compra: parsedCompra.data, movimiento: parsedMovimiento.data, producto: nextProducto },
    createAuditHook(deps.audit, actor.id, "stock.purchase", "compra", compraId, { productoId: found.value.id })
  );
}
