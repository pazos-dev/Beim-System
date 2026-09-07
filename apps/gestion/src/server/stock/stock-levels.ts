import { z } from "zod";

import { balanceKey, DEPOSITS, deriveBalances } from "../../lib/domain/inventory/inventory";
import type { GestionError } from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";
import type { StockRepositoryPort } from "./stock-port";

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

export async function fetchLevels(
  port: StockRepositoryPort,
  actor: PortActor,
  productoIds: string[],
  query: StockListQuery
): Promise<Result<StockLevelsResponse, GestionError>> {
  const [productos, movimientos] = await Promise.all([
    port.listProductos(actor),
    port.listMovimientos(actor)
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
