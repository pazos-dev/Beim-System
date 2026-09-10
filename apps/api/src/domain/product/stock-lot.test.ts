import { describe, expect, it } from "vitest";

import { InsufficientStockError, ValidationError } from "../../errors/taxonomy.js";
import { createMoney } from "../shared/types.js";
import {
  allocateTallerLots,
  allocateVentaLots,
  availableTallerOf,
  availableVentaOf,
  createStockLot,
  lotFromLegacyStock,
  restoreLots,
  stockOf,
  type CreateStockLotInput,
  type StockLot
} from "./stock-lot.js";
import type { ProductRepository, ProductWithLots } from "./product.repository.js";
import { createProduct } from "./product.js";

const PRODUCT_ID = "prod-a15-pantalla";
const PRICE = createMoney(120, "UYU");
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";

function mkLot(
  id: string,
  purpose: string,
  initial: number,
  remaining: number,
  createdAt: string,
  override?: number
): StockLot {
  const input: CreateStockLotInput = {
    id,
    productId: PRODUCT_ID,
    initialQty: initial,
    remainingQty: remaining,
    unitCostAmount: 80,
    unitCostCurrency: "UYU",
    purpose,
    createdAt: new Date(createdAt)
  };
  return createStockLot(
    override === undefined
      ? input
      : { ...input, salePriceAmount: override, salePriceCurrency: "UYU" }
  );
}

/** Spec fixture: venta L1 (2 @100, older) + L2 (3 @price) + taller T1 (4). */
function scenarioLots(): StockLot[] {
  return [
    mkLot(L1, "venta", 2, 2, "2026-01-01T00:00:00.000Z", 100),
    mkLot(L2, "venta", 3, 3, "2026-02-01T00:00:00.000Z"),
    mkLot(T1, "taller", 4, 4, "2026-01-15T00:00:00.000Z")
  ];
}

function legacyInput(stock: number) {
  return {
    productId: PRODUCT_ID,
    stock,
    lotId: "44444444-4444-4444-8444-444444444444",
    unitCostAmount: 80,
    unitCostCurrency: "UYU",
    createdAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

describe("StockLot lots (domain slice, NEW BEHAVIOR)", () => {
  it("creates a venta lot with remaining defaulting to initial", () => {
    const lot = mkLot(L1, "venta", 5, 5, "2026-01-01T00:00:00.000Z");

    expect(lot.salePriceOverride).toBeNull();
    expect(stockOf([lot])).toBe(5);
  });

  it("rejects remaining above initial, non-positive initial, bad purpose, or negative cost", () => {
    expect(() => mkLot(L1, "venta", 0, 0, "2026-01-01T00:00:00.000Z")).toThrow(ValidationError);
    expect(() => mkLot(L1, "venta", 5, 6, "2026-01-01T00:00:00.000Z")).toThrow(ValidationError);
    expect(() => mkLot(L1, "deposito", 5, 5, "2026-01-01T00:00:00.000Z")).toThrow(ValidationError);
    expect(() =>
      createStockLot({
        id: L1,
        productId: PRODUCT_ID,
        initialQty: 5,
        unitCostAmount: -1,
        unitCostCurrency: "UYU",
        purpose: "venta",
        createdAt: new Date("2026-01-01T00:00:00.000Z")
      })
    ).toThrow(ValidationError);
  });

  it("allocates 2 from L1 at 100 plus 2 from L2 at 120, keeping taller at 4", () => {
    const sale = allocateVentaLots(scenarioLots(), 4, PRICE);

    expect(sale.allocations).toEqual([
      { lotId: L1, qty: 2, unitPrice: { amount: 100, currency: "UYU" } },
      { lotId: L2, qty: 2, unitPrice: PRICE }
    ]);
    expect(availableVentaOf(sale.lots)).toBe(1);
    expect(availableTallerOf(sale.lots)).toBe(4);
  });

  it("leaves the venta lane untouched when consuming the workshop lane", () => {
    const sale = allocateVentaLots(scenarioLots(), 4, PRICE);
    const workshop = allocateTallerLots(sale.lots, 2);

    expect(workshop.allocations).toEqual([{ lotId: T1, qty: 2 }]);
    expect(availableTallerOf(workshop.lots)).toBe(2);
    expect(availableVentaOf(workshop.lots)).toBe(1);
  });

  it("rejects a sale shortfall with INSUFFICIENT_STOCK and leaves lots unchanged", () => {
    const lots = scenarioLots();

    expect(() => allocateVentaLots(lots, 6, PRICE)).toThrow(InsufficientStockError);
    expect(() => allocateVentaLots(lots, 0, PRICE)).toThrow(ValidationError);
    expect(availableVentaOf(lots)).toBe(5);
    expect(lots[0]?.remainingQty).toBe(2);
  });

  it("returns each quantity to its origin lot and rejects unknown lots", () => {
    const lots = scenarioLots();
    const sale = allocateVentaLots(lots, 4, PRICE);

    const restored = restoreLots(sale.lots, sale.allocations);

    expect(availableVentaOf(restored)).toBe(5);
    expect(stockOf(restored)).toBe(9);
    expect(() => restoreLots(scenarioLots(), [{ lotId: "missing-lot", qty: 1 }])).toThrow(
      ValidationError
    );
  });

  it("maps legacy stock to one initial venta lot, zero stock to no lots", () => {
    const lots = lotFromLegacyStock(legacyInput(5));

    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      productId: PRODUCT_ID,
      initialQty: 5,
      remainingQty: 5,
      purpose: "venta"
    });
    expect(lotFromLegacyStock(legacyInput(0))).toEqual([]);
  });

  it("round-trips a product with its lots through the extended port", async () => {
    const store = new Map<string, ProductWithLots>();
    const repo: ProductRepository = {
      async findById(id) {
        return store.get(id)?.product ?? null;
      },
      async save(product) {
        store.set(product.id, { product, lots: store.get(product.id)?.lots ?? [] });
      },
      async findWithLots(id) {
        return store.get(id) ?? null;
      },
      async saveWithLots(input) {
        store.set(input.product.id, input);
      }
    };
    const product = createProduct({
      id: PRODUCT_ID,
      productCode: 1001,
      name: "Pantalla A15",
      categoryId: "cat-repuestos",
      priceAmount: 120,
      priceCurrency: "UYU",
      stock: 0
    });

    await repo.saveWithLots({ product, lots: scenarioLots() });
    const loaded = await repo.findWithLots(product.id);

    expect(loaded?.lots).toHaveLength(3);
    expect(stockOf(loaded?.lots ?? [])).toBe(9);
  });
});
