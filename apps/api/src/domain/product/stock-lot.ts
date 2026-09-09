/**
 * StockLot child entity (domain slice, change `clean-arch-domain` Phase 3B).
 *
 * NEW BEHAVIOR — approved exception to the freeze: `Product` owns
 * purpose-segregated lots in the same aggregate and transaction. `venta`
 * lots feed `VentaLine`, `taller` lots feed `ReceiptPart`; lanes never mix.
 * Immutable values; every behavior returns new copies. No DDL here —
 * persistence lives behind `ProductRepository`.
 */
import { InsufficientStockError, ValidationError } from "../shared/errors.js";
import {
  createMoney,
  createProductId,
  type Money,
  type ProductId
} from "../shared/types.js";

/** Acquisition lane: `venta` feeds sales, `taller` feeds workshop repairs. */
export const STOCK_PURPOSES = ["venta", "taller"] as const;

export type StockPurpose = (typeof STOCK_PURPOSES)[number];

export function isStockPurpose(value: string): value is StockPurpose {
  return (STOCK_PURPOSES as readonly string[]).includes(value);
}

/** Purpose-segregated stock lot, child of `Product` (same aggregate). */
export interface StockLot {
  readonly id: string;
  readonly productId: ProductId;
  readonly initialQty: number;
  readonly remainingQty: number;
  readonly unitCost: Money;
  readonly salePriceOverride: Money | null;
  readonly purpose: StockPurpose;
  readonly acquiredVia: string;
  readonly supplierLot: string;
  readonly createdAt: Date;
}

export interface CreateStockLotInput {
  readonly id: string;
  readonly productId: string;
  readonly initialQty: number;
  readonly remainingQty?: number;
  readonly unitCostAmount: number;
  readonly unitCostCurrency: string;
  readonly salePriceAmount?: number;
  readonly salePriceCurrency?: string;
  readonly purpose: string;
  readonly acquiredVia?: string;
  readonly supplierLot?: string;
  readonly createdAt: Date;
}

function cleanPositiveInt(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError(`Lote inválido: ${field} debe ser un entero positivo`, {
      field,
      value
    });
  }
  return value;
}

export function createStockLot(input: CreateStockLotInput): StockLot {
  if (input.id.trim() === "") {
    throw new ValidationError("Lote inválido: id no puede estar vacío", { value: input.id });
  }
  if (!isStockPurpose(input.purpose)) {
    throw new ValidationError("Lote inválido: purpose debe ser venta o taller", {
      purpose: input.purpose
    });
  }
  const initialQty = cleanPositiveInt(input.initialQty, "initialQty");
  const remainingQty = input.remainingQty ?? initialQty;
  if (!Number.isInteger(remainingQty) || remainingQty < 0 || remainingQty > initialQty) {
    throw new ValidationError("Lote inválido: remainingQty debe cumplir 0 <= remaining <= initial", {
      remainingQty,
      initialQty
    });
  }
  return {
    id: input.id,
    productId: createProductId(input.productId),
    initialQty,
    remainingQty,
    unitCost: createMoney(input.unitCostAmount, input.unitCostCurrency),
    salePriceOverride:
      input.salePriceAmount === undefined
        ? null
        : createMoney(input.salePriceAmount, input.salePriceCurrency ?? "UYU"),
    purpose: input.purpose,
    acquiredVia: input.acquiredVia ?? "",
    supplierLot: input.supplierLot ?? "",
    createdAt: input.createdAt
  };
}

function sumRemaining(lots: readonly StockLot[]): number {
  return lots.reduce((total, lot) => total + lot.remainingQty, 0);
}

/** Derived: sum of remaining across every lot. */
export function stockOf(lots: readonly StockLot[]): number {
  return sumRemaining(lots);
}

/** Derived: sum of remaining of `venta` lots only. */
export function availableVentaOf(lots: readonly StockLot[]): number {
  return sumRemaining(lots.filter((lot) => lot.purpose === "venta"));
}

/** Derived: sum of remaining of `taller` lots only. */
export function availableTallerOf(lots: readonly StockLot[]): number {
  return sumRemaining(lots.filter((lot) => lot.purpose === "taller"));
}

/** Server-side line price: lot override wins, otherwise the product price. */
export function lotLinePrice(lot: StockLot, productPrice: Money): Money {
  return lot.salePriceOverride ?? productPrice;
}

export interface VentaAllocation {
  readonly lotId: string;
  readonly qty: number;
  readonly unitPrice: Money;
}

export interface TallerAllocation {
  readonly lotId: string;
  readonly qty: number;
}

interface LotTake {
  readonly lot: StockLot;
  readonly qty: number;
}

/** Shared FIFO core: takes `qty` from `purpose` lots oldest-first. */
function takeFromLane(
  lots: readonly StockLot[],
  purpose: StockPurpose,
  qty: number,
  laneNoun: string
): { lots: StockLot[]; takes: LotTake[] } {
  const amount = cleanPositiveInt(qty, `cantidad a ${laneNoun}`);
  const available = sumRemaining(lots.filter((lot) => lot.purpose === purpose));
  if (available < amount) {
    throw new InsufficientStockError(`Stock insuficiente en lotes de ${purpose}`, {
      currentStock: available
    });
  }
  const lane = lots
    .filter((lot) => lot.purpose === purpose && lot.remainingQty > 0)
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let pending = amount;
  const takes: LotTake[] = [];
  const consumed = new Map<string, number>();
  for (const lot of lane) {
    if (pending === 0) {
      break;
    }
    const take = Math.min(lot.remainingQty, pending);
    takes.push({ lot, qty: take });
    consumed.set(lot.id, take);
    pending -= take;
  }
  const updated = lots.map((lot) => {
    const take = consumed.get(lot.id);
    return take === undefined ? lot : { ...lot, remainingQty: lot.remainingQty - take };
  });
  return { lots: updated, takes };
}

/**
 * Guarded sale decrement: allocates `venta` lots FIFO with lane pricing.
 * `taller` lots stay untouched.
 */
export function allocateVentaLots(
  lots: readonly StockLot[],
  qty: number,
  productPrice: Money
): { lots: StockLot[]; allocations: VentaAllocation[] } {
  const { lots: updated, takes } = takeFromLane(lots, "venta", qty, "vender");
  const allocations = takes.map((take) => ({
    lotId: take.lot.id,
    qty: take.qty,
    unitPrice: lotLinePrice(take.lot, productPrice)
  }));
  return { lots: updated, allocations };
}

/** Workshop consume: allocates `taller` lots FIFO; `venta` stays untouched. */
export function allocateTallerLots(
  lots: readonly StockLot[],
  qty: number
): { lots: StockLot[]; allocations: TallerAllocation[] } {
  const { lots: updated, takes } = takeFromLane(lots, "taller", qty, "consumir en taller");
  return {
    lots: updated,
    allocations: takes.map((take) => ({ lotId: take.lot.id, qty: take.qty }))
  };
}

/** Guarded restore: returns each quantity to its origin lot. */
export function restoreLots(
  lots: readonly StockLot[],
  allocations: readonly { lotId: string; qty: number }[]
): StockLot[] {
  const byId = new Map(lots.map((lot) => [lot.id, lot] as const));
  for (const allocation of allocations) {
    const lot = byId.get(allocation.lotId);
    if (lot === undefined) {
      throw new ValidationError("Lote inválido: restauración sobre lote desconocido", {
        lotId: allocation.lotId
      });
    }
    cleanPositiveInt(allocation.qty, "cantidad a restaurar");
    if (lot.remainingQty + allocation.qty > lot.initialQty) {
      throw new ValidationError("Lote inválido: restauración excede la cantidad inicial", {
        lotId: allocation.lotId
      });
    }
  }
  const returned = new Map<string, number>();
  for (const allocation of allocations) {
    returned.set(allocation.lotId, (returned.get(allocation.lotId) ?? 0) + allocation.qty);
  }
  return lots.map((lot) => {
    const back = returned.get(lot.id);
    return back === undefined ? lot : { ...lot, remainingQty: lot.remainingQty + back };
  });
}

export interface LegacyStockInput {
  readonly productId: string;
  readonly stock: number;
  readonly lotId: string;
  readonly unitCostAmount: number;
  readonly unitCostCurrency: string;
  readonly acquiredVia?: string;
  readonly supplierLot?: string;
  readonly createdAt: Date;
}

/**
 * Legacy mapping: a positive `products.stock` becomes one initial `venta`
 * lot; zero stock maps to no lots (initialQty must stay > 0).
 */
export function lotFromLegacyStock(input: LegacyStockInput): StockLot[] {
  if (!Number.isInteger(input.stock) || input.stock < 0) {
    throw new ValidationError("Lote inválido: stock legacy debe ser un entero no negativo", {
      stock: input.stock
    });
  }
  if (input.stock === 0) {
    return [];
  }
  return [
    createStockLot({
      id: input.lotId,
      productId: input.productId,
      initialQty: input.stock,
      unitCostAmount: input.unitCostAmount,
      unitCostCurrency: input.unitCostCurrency,
      purpose: "venta",
      acquiredVia: input.acquiredVia ?? "migracion",
      supplierLot: input.supplierLot ?? "",
      createdAt: input.createdAt
    })
  ];
}
