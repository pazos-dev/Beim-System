import { describe, expect, it } from "vitest";

import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import { createProductId, type ProductId } from "../../domain/shared/types.js";
import {
  InsufficientStockError,
  NotFoundError,
  ValidationError
} from "../../domain/shared/errors.js";
import { createProduct, type Product } from "../../domain/product/product.js";
import {
  availableTallerOf,
  availableVentaOf,
  createStockLot,
  type CreateStockLotInput,
  type StockLot
} from "../../domain/product/stock-lot.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import { makeCatalogProductHandlers } from "./product-handlers.js";
import type { CatalogProductStore } from "./ports.js";

const PRODUCT_ID = "prod-a15-pantalla";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const T1 = "33333333-3333-4333-8333-333333333333";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeCatalogStore implements CatalogProductStore {
  products = new Map<string, Product>();
  lots = new Map<string, StockLot[]>();
  seenTx: TxClient[] = [];
  saves = 0;

  private touch(tx: TxClient): void {
    this.seenTx.push(tx);
  }

  async findProduct(tx: TxClient, id: ProductId): Promise<Product | null> {
    this.touch(tx);
    return this.products.get(id) ?? null;
  }

  async findWithLots(tx: TxClient, id: ProductId): Promise<ProductWithLots | null> {
    this.touch(tx);
    const product = this.products.get(id) ?? null;
    if (product === null) return null;
    return { product, lots: this.lots.get(id) ?? [] };
  }

  async saveProduct(tx: TxClient, product: Product): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.products.set(product.id, product);
  }

  async saveWithLots(tx: TxClient, input: ProductWithLots): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.products.set(input.product.id, input.product);
    this.lots.set(input.product.id, [...input.lots]);
  }
}

function setup() {
  const uow = new FakeUnitOfWork();
  const store = new FakeCatalogStore();
  const handlers = makeCatalogProductHandlers({ uow, products: store });
  return { uow, store, handlers };
}

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

/** Spec fixture: product stock 5 + venta L1 (2 @100) + L2 (3 @price 120) + taller T1 (4). */
function seedCatalog(store: FakeCatalogStore): Product {
  const product = createProduct({
    id: PRODUCT_ID,
    productCode: 1001,
    name: "Pantalla A15",
    categoryId: "cat-repuestos",
    priceAmount: 120,
    priceCurrency: "UYU",
    stock: 5
  });
  store.products.set(PRODUCT_ID, product);
  store.lots.set(PRODUCT_ID, [
    mkLot(L1, "venta", 2, 2, "2026-01-01T00:00:00.000Z", 100),
    mkLot(L2, "venta", 3, 3, "2026-02-01T00:00:00.000Z"),
    mkLot(T1, "taller", 4, 4, "2026-01-15T00:00:00.000Z")
  ]);
  return product;
}

describe("catalog product handlers (DB-free)", () => {
  it("creates a product in one run on the same tx", async () => {
    const { uow, store, handlers } = setup();

    const product = await handlers.create({
      id: PRODUCT_ID,
      productCode: 1001,
      name: "Pantalla A15",
      categoryId: "cat-repuestos",
      priceAmount: 120,
      priceCurrency: "UYU",
      stock: 5
    });

    expect(product.id).toBe(createProductId(PRODUCT_ID));
    expect(store.products.get(PRODUCT_ID)?.name).toBe("Pantalla A15");
    expect(uow.runs).toBe(1);
    expect(store.seenTx.length).toBeGreaterThan(0);
    expect(store.seenTx.every((tx) => tx === uow.tx)).toBe(true);
  });

  it("rejects invalid create input with zero saves", async () => {
    const { store, handlers } = setup();

    await expect(
      handlers.create({
        id: PRODUCT_ID,
        productCode: 1001,
        name: "   ",
        categoryId: "cat-repuestos",
        priceAmount: 120,
        priceCurrency: "UYU",
        stock: 5
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(store.saves).toBe(0);
  });

  it("sells 4 across FIFO venta lanes with lane pricing, syncing simple stock", async () => {
    const { uow, store, handlers } = setup();
    seedCatalog(store);

    const result = await handlers.sell({ productId: PRODUCT_ID, qty: 4 });

    expect(result.allocations).toEqual([
      { lotId: L1, qty: 2, unitPrice: { amount: 100, currency: "UYU" } },
      { lotId: L2, qty: 2, unitPrice: { amount: 120, currency: "UYU" } }
    ]);
    expect(result.product.stock).toBe(1);
    expect(availableVentaOf(result.lots)).toBe(1);
    expect(availableTallerOf(result.lots)).toBe(4);
    expect(uow.runs).toBe(1);
    expect(store.saves).toBe(1);
    expect(store.seenTx.every((tx) => tx === uow.tx)).toBe(true);
  });

  it("propagates a sale shortfall as INSUFFICIENT_STOCK 409 with zero saves", async () => {
    const { store, handlers } = setup();
    seedCatalog(store);

    try {
      await handlers.sell({ productId: PRODUCT_ID, qty: 6 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientStockError);
      expect((err as InsufficientStockError).code).toBe("INSUFFICIENT_STOCK");
      expect((err as InsufficientStockError).status).toBe(409);
    }
    expect(store.saves).toBe(0);
  });

  it("consumes the taller lane keeping venta untouched", async () => {
    const { uow, store, handlers } = setup();
    seedCatalog(store);

    const result = await handlers.consumeWorkshop({ productId: PRODUCT_ID, qty: 2 });

    expect(result.allocations).toEqual([{ lotId: T1, qty: 2 }]);
    expect(availableTallerOf(result.lots)).toBe(2);
    expect(availableVentaOf(result.lots)).toBe(5);
    expect(result.product.stock).toBe(5);
    expect(uow.runs).toBe(1);
    expect(store.saves).toBe(1);
  });

  it("restores sold lots and the simple stock pile", async () => {
    const { store, handlers } = setup();
    seedCatalog(store);
    const sold = await handlers.sell({ productId: PRODUCT_ID, qty: 4 });

    const restored = await handlers.restore({ productId: PRODUCT_ID, allocations: sold.allocations });

    expect(restored.product.stock).toBe(5);
    expect(availableVentaOf(restored.lots)).toBe(5);
    expect(availableTallerOf(restored.lots)).toBe(4);
  });

  it("maps unknown products to 404 on sell and workshop consume", async () => {
    const { handlers } = setup();

    for (const run of [
      () => handlers.sell({ productId: PRODUCT_ID, qty: 1 }),
      () => handlers.consumeWorkshop({ productId: PRODUCT_ID, qty: 1 })
    ]) {
      try {
        await run();
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        expect((err as NotFoundError).code).toBe("NOT_FOUND_OR_FORBIDDEN");
        expect((err as NotFoundError).status).toBe(404);
      }
    }
  });

  it("propagates malformed ids as 422 without touching the store", async () => {
    const { store, handlers } = setup();

    await expect(handlers.sell({ productId: "   ", qty: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(store.saves).toBe(0);
    expect(store.seenTx).toHaveLength(0);
  });
});
