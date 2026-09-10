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
  createStockLot,
  type StockLot
} from "../../domain/product/stock-lot.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { Venta } from "../../domain/venta/venta.js";
import { makeSalesBatchHandler } from "./sales-batch.js";
import type { SalesProductStore, SalesVentaStore } from "./ports.js";

const P1 = "prod-a15-pantalla";
const P2 = "prod-b20-bateria";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeSalesProductStore implements SalesProductStore {
  products = new Map<string, Product>();
  lots = new Map<string, StockLot[]>();
  seenTx: TxClient[] = [];
  saves = 0;

  private touch(tx: TxClient): void {
    this.seenTx.push(tx);
  }

  async findWithLots(tx: TxClient, id: ProductId): Promise<ProductWithLots | null> {
    this.touch(tx);
    const product = this.products.get(id) ?? null;
    if (product === null) return null;
    return { product, lots: this.lots.get(id) ?? [] };
  }

  async saveWithLots(tx: TxClient, input: ProductWithLots): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.products.set(input.product.id, input.product);
    this.lots.set(input.product.id, [...input.lots]);
  }
}

class FakeSalesVentaStore implements SalesVentaStore {
  saved: Venta | null = null;
  seenTx: TxClient[] = [];
  saves = 0;

  async save(tx: TxClient, venta: Venta): Promise<void> {
    this.seenTx.push(tx);
    this.saves += 1;
    this.saved = venta;
  }
}

function setup() {
  const uow = new FakeUnitOfWork();
  const products = new FakeSalesProductStore();
  const ventas = new FakeSalesVentaStore();
  const handler = makeSalesBatchHandler({ uow, products, ventas });
  return { uow, products, ventas, handler };
}

function mkLot(id: string, productId: string, remaining: number, override?: number): StockLot {
  return createStockLot({
    id,
    productId,
    initialQty: remaining,
    remainingQty: remaining,
    unitCostAmount: 80,
    unitCostCurrency: "UYU",
    ...(override === undefined
      ? {}
      : { salePriceAmount: override, salePriceCurrency: "UYU" }),
    purpose: "venta",
    createdAt: new Date("2026-01-01T00:00:00.000Z")
  });
}

/** Spec fixture: P1 price 100 stock 5 lot 5, P2 price 50 stock 3 lot 3. */
function seedSales(store: FakeSalesProductStore): void {
  store.products.set(
    P1,
    createProduct({
      id: P1,
      productCode: 1001,
      name: "Pantalla A15",
      categoryId: "cat-repuestos",
      priceAmount: 100,
      priceCurrency: "UYU",
      stock: 5
    })
  );
  store.products.set(
    P2,
    createProduct({
      id: P2,
      productCode: 1002,
      name: "Bateria B20",
      categoryId: "cat-repuestos",
      priceAmount: 50,
      priceCurrency: "UYU",
      stock: 3
    })
  );
  store.lots.set(P1, [mkLot(L1, P1, 5)]);
  store.lots.set(P2, [mkLot(L2, P2, 3)]);
}

function exactPayments() {
  return [{ method: "efectivo", amount: 250, currency: "UYU" }];
}

/** Legacy intake shape: payments carry no currency (derived from rows). */
function legacyIntake() {
  return {
    ventaId: "v-batch-legacy",
    clientName: "Cliente Batch",
    clientId: "api-cli-5",
    deviceBrand: "Samsung",
    deviceModel: "A15",
    imeiSerial: "358000000000001",
    reportedIssue: "Pantalla rota",
    services: ["Cambio de pantalla"],
    lines: [
      { productId: P1, quantity: 2 },
      { productId: P2, quantity: 1 }
    ],
    payments: [{ method: "Efectivo", amount: 250 }],
    userId: "user-operator-1"
  };
}

describe("sales-batch handler (Unit 3)", () => {
  it("confirms an atomic mostrador batch with server-side pricing in one run", async () => {
    const { uow, products, ventas, handler } = setup();
    seedSales(products);

    const result = await handler.confirmBatch({
      ventaId: "v-batch-1",
      clientName: "Cliente Batch",
      lines: [
        { productId: P1, quantity: 2 },
        { productId: P2, quantity: 1 }
      ],
      payments: exactPayments()
    });

    expect(uow.runs).toBe(1);
    // Server-side: total comes from locked rows, never from the DTO.
    expect(result.venta.total).toEqual({ amount: 250, currency: "UYU" });
    expect(result.venta.stockCommitted).toBe(true);
    expect(result.venta.lines[0].allocations).toEqual([
      { lotId: L1, qty: 2, unitPrice: { amount: 100, currency: "UYU" } }
    ]);
    // Simple stock and lots move together, venta persisted, same tx.
    expect(products.products.get(createProductId(P1))?.stock).toBe(3);
    expect(products.lots.get(P1)?.[0].remainingQty).toBe(3);
    expect(ventas.saves).toBe(1);
    expect(ventas.saved?.id).toBe("v-batch-1");
    expect(products.saves).toBe(2);
    expect([...products.seenTx, ...ventas.seenTx].every((tx) => tx === uow.tx)).toBe(true);
  });

  it("maps a lot shortfall to 409 with zero saves committed", async () => {
    const { uow, products, ventas, handler } = setup();
    seedSales(products);

    const error = await handler
      .confirmBatch({
        ventaId: "v-batch-2",
        clientName: "Cliente Batch",
        lines: [
          { productId: P1, quantity: 2 },
          { productId: P2, quantity: 9 }
        ],
        payments: [{ method: "efectivo", amount: 650, currency: "UYU" }]
      })
      .then(
        () => null,
        (err: unknown) => err
      );

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect(uow.runs).toBe(1);
    expect(ventas.saves).toBe(0);
    expect(products.saves).toBe(0);
    expect(products.products.get(createProductId(P1))?.stock).toBe(5);
    expect(products.lots.get(P1)?.[0].remainingQty).toBe(5);
  });

  it("rejects an unknown line product with 404 and zero saves", async () => {
    const { products, ventas, handler } = setup();
    seedSales(products);

    const error = await handler
      .confirmBatch({
        ventaId: "v-batch-3",
        clientName: "Cliente Batch",
        lines: [{ productId: P1, quantity: 1 }],
        payments: [{ method: "efectivo", amount: 100, currency: "UYU" }]
      })
      .then(
        () => null,
        (err: unknown) => err
      );

    expect(error).toBeNull();
    const missing = await handler
      .confirmBatch({
        ventaId: "v-batch-4",
        clientName: "Cliente Batch",
        lines: [{ productId: "prod-fantasma", quantity: 1 }],
        payments: [{ method: "efectivo", amount: 100, currency: "UYU" }]
      })
      .then(
        () => null,
        (err: unknown) => err
      );

    expect(missing).toBeInstanceOf(NotFoundError);
    expect(ventas.saves).toBe(1);
    expect(products.saves).toBe(1);
  });

  it("rejects a malformed product id with 422 and zero store touch", async () => {
    const { uow, products, ventas, handler } = setup();
    seedSales(products);

    const error = await handler
      .confirmBatch({
        ventaId: "v-batch-5",
        clientName: "Cliente Batch",
        lines: [{ productId: "   ", quantity: 1 }],
        payments: [{ method: "efectivo", amount: 100, currency: "UYU" }]
      })
      .then(
        () => null,
        (err: unknown) => err
      );

    expect(error).toBeInstanceOf(ValidationError);
    expect(uow.runs).toBe(0);
    expect(products.seenTx).toHaveLength(0);
    expect(ventas.saves).toBe(0);
    expect(products.saves).toBe(0);
  });

  it("carries legacy intake metadata and derives payment currency from rows", async () => {
    const { products, ventas, handler } = setup();
    seedSales(products);

    const result = await handler.confirmBatch(legacyIntake());

    expect(result.venta.clientName).toBe("Cliente Batch");
    expect(result.venta.clientId).toBe("api-cli-5");
    expect(result.venta.deviceBrand).toBe("Samsung");
    expect(result.venta.deviceModel).toBe("A15");
    expect(result.venta.imeiSerial).toBe("358000000000001");
    expect(result.venta.reportedIssue).toBe("Pantalla rota");
    expect(result.venta.services).toEqual(["Cambio de pantalla"]);
    expect(result.venta.userId).toBe("user-operator-1");
    // Currency never comes from the client here: rows price UYU, total UYU.
    expect(result.venta.total).toEqual({ amount: 250, currency: "UYU" });
    expect(result.venta.payments).toEqual([
      { method: "Efectivo", amount: { amount: 250, currency: "UYU" } }
    ]);
    expect(ventas.saved?.id).toBe("v-batch-legacy");
  });

  it("rejects a blank clientName with 422 and zero store touch", async () => {
    const { uow, products, ventas, handler } = setup();
    seedSales(products);

    const error = await handler
      .confirmBatch({ ...legacyIntake(), clientName: "   " })
      .then(
        () => null,
        (err: unknown) => err
      );

    expect(error).toBeInstanceOf(ValidationError);
    expect(uow.runs).toBe(0);
    expect(ventas.saves).toBe(0);
    expect(products.saves).toBe(0);
  });

  it("rejects an explicit payment currency that mismatches the rows", async () => {
    const { products, ventas, handler } = setup();
    seedSales(products);

    const error = await handler
      .confirmBatch({
        ...legacyIntake(),
        payments: [{ method: "Efectivo", amount: 250, currency: "USD" }]
      })
      .then(
        () => null,
        (err: unknown) => err
      );

    expect(error).toBeInstanceOf(ValidationError);
    expect(ventas.saves).toBe(0);
    expect(products.saves).toBe(0);
  });
});
