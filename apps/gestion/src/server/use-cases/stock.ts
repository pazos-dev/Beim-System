import { z } from "zod";

import { balanceKey, DEPOSITS, deriveBalances } from "../../lib/domain/inventory/inventory";
import type { GestionError } from "../data/schemas";
import type { AuthActor } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { StockRepositoryPort } from "../ports/stock";

export interface StockActor {
  hasGlobalAccess: boolean;
  id: string;
}

export function toStockActor(auth: AuthActor): StockActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id
  };
}

function toPortActor(actor: StockActor): PortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

export const stockListQuerySchema = z.object({
  productoId: z.string().min(1).max(100).optional(),
  deposito: z.string().trim().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type StockListQuery = z.infer<typeof stockListQuerySchema>;

export interface StockLevelItem {
  balance: number;
  deposito: string;
  displayName: string;
  lowStock: boolean;
  minimum: number;
  productoId: string;
}

export interface StockLevelsResponse {
  items: StockLevelItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

export interface StockBalance {
  balance: number;
  deposito: string;
  minimum: number;
  productoId: string;
}

export class StockUseCases {
  private readonly port: StockRepositoryPort;

  public constructor(port: StockRepositoryPort) {
    this.port = port;
  }

  public async getLevels(
    actor: StockActor,
    query: StockListQuery
  ): Promise<Result<StockLevelsResponse, GestionError>> {
    const portActor = toPortActor(actor);
    if (query.productoId !== undefined) {
      const single = await this.port.getProducto(portActor, query.productoId);
      if (!single.ok) return err(single.error);
      return this.levelsFor(portActor, [single.value.id], query);
    }
    const listed = await this.port.listProductos(portActor);
    if (!listed.ok) return err(listed.error);
    return this.levelsFor(
      portActor,
      listed.value.map((item) => item.id),
      query
    );
  }

  public async checkAvailability(
    actor: StockActor,
    productoId: string,
    cantidad: number
  ): Promise<Result<StockBalance, GestionError>> {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["cantidad"] }));
    }
    const producto = await this.port.getProducto(toPortActor(actor), productoId);
    if (!producto.ok) return err(producto.error);
    if (producto.value.stock < cantidad) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["cantidad"] }));
    }
    return ok({
      balance: producto.value.stock,
      deposito: DEPOSITS.PRINCIPAL,
      minimum: producto.value.minimum,
      productoId: producto.value.id
    });
  }

  private async levelsFor(
    actor: PortActor,
    productoIds: string[],
    query: StockListQuery
  ): Promise<Result<StockLevelsResponse, GestionError>> {
    const [productos, movimientos] = await Promise.all([
      this.port.listProductos(actor),
      this.port.listMovimientos(actor)
    ]);
    if (!productos.ok) return err(productos.error);
    if (!movimientos.ok) return err(movimientos.error);
    const byId = new Map(productos.value.map((item) => [item.id, item]));
    const balances = deriveBalances(movimientos.value);
    const items: StockLevelItem[] = [];
    for (const id of productoIds) {
      const producto = byId.get(id);
      if (producto === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
      const observed = new Set<string>([DEPOSITS.PRINCIPAL, DEPOSITS.TALLER]);
      for (const move of movimientos.value) {
        if (move.productoId === id && move.deposito !== undefined) observed.add(move.deposito);
      }
      for (const deposito of observed) {
        const balance =
          deposito === DEPOSITS.PRINCIPAL
            ? producto.stock
            : (balances.get(balanceKey(id, deposito)) ?? 0);
        items.push({
          balance,
          deposito,
          displayName: producto.displayName,
          lowStock: balance < producto.minimum,
          minimum: producto.minimum,
          productoId: id
        });
      }
    }
    items.sort((a, b) => a.productoId.localeCompare(b.productoId) || a.deposito.localeCompare(b.deposito));
    const filtered =
      query.deposito === undefined ? items : items.filter((item) => item.deposito === query.deposito);
    const totalItems = filtered.length;
    const start = (query.page - 1) * query.pageSize;
    return ok({
      items: filtered.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      totalItems
    });
  }
}
