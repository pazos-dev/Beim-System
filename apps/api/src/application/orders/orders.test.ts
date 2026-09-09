import { describe, expect, it } from "vitest";

import type { Clock, PaymentGatewayPort, TxClient, UnitOfWork, Uuid } from "../../domain/shared/ports.js";
import { createProductId, type ProductId } from "../../domain/shared/types.js";
import { ConflictError, InsufficientStockError, NotFoundError } from "../../domain/shared/errors.js";
import { createProduct, type Product } from "../../domain/product/product.js";
import { createStockLot, type StockLot } from "../../domain/product/stock-lot.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import { cancelCheckoutSession, type Venta } from "../../domain/venta/venta.js";
import { makeOrderHandlers } from "./orders.js";
import type { OrderPagoStore, OrderProductStore, OrderVentaStore } from "./ports.js";

const P1 = "prod-a15-pantalla";
const P2 = "prod-b20-bateria";
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-03-01T10:00:00.000Z");

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;
  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

/** Reads only: check-not-reserve holds by construction, no save path exists. */
class FakeOrderProductStore implements OrderProductStore {
  products = new Map<string, Product>();
  lots = new Map<string, StockLot[]>();
  seenTx: TxClient[] = [];
  async findWithLots(tx: TxClient, id: ProductId): Promise<ProductWithLots | null> {
    this.seenTx.push(tx);
    const product = this.products.get(id) ?? null;
    if (product === null) return null;
    return { product, lots: this.lots.get(id) ?? [] };
  }
}

class FakeOrderVentaStore implements OrderVentaStore {
  stored = new Map<string, Venta>();
  seenTx: TxClient[] = [];
  saves = 0;
  async findById(tx: TxClient, id: string): Promise<Venta | null> {
    this.seenTx.push(tx);
    return this.stored.get(id) ?? null;
  }
  async save(tx: TxClient, venta: Venta): Promise<void> {
    this.seenTx.push(tx);
    this.saves += 1;
    this.stored.set(venta.id, venta);
  }
}

class FakeOrderPagoStore implements OrderPagoStore {
  seenTx: TxClient[] = [];
  saves = 0;
  async save(tx: TxClient, _pago: Parameters<OrderPagoStore["save"]>[1]): Promise<void> {
    this.seenTx.push(tx);
    this.saves += 1;
  }
}

class FakeGateway implements PaymentGatewayPort {
  calls = 0;
  async createPreference(orderId: string, _amount: number): Promise<{ preferenceId: string }> {
    this.calls += 1;
    return { preferenceId: `pref-${orderId}-${this.calls}` };
  }
}

function setup(sessionIds: string[] = ["cs-1", "cs-2"]) {
  const uow = new FakeUnitOfWork();
  const products = new FakeOrderProductStore();
  const ventas = new FakeOrderVentaStore();
  const pagos = new FakeOrderPagoStore();
  const gateway = new FakeGateway();
  const clock: Clock = { now: () => new Date(NOW) };
  const queue = [...sessionIds];
  const uuid: Uuid = {
    generate: () => {
      const next = queue.shift();
      if (next === undefined) throw new Error("uuid queue exhausted");
      return next;
    }
  };
  return { uow, products, ventas, pagos, gateway, handler: makeOrderHandlers({ uow, products, ventas, pagos, gateway, clock, uuid }) };
}

function mkLot(id: string, productId: string, remaining: number): StockLot {
  return createStockLot({
    id, productId, initialQty: remaining, remainingQty: remaining,
    unitCostAmount: 80, unitCostCurrency: "UYU", purpose: "venta",
    createdAt: new Date("2026-01-01T00:00:00.000Z")
  });
}

function seedOrders(store: FakeOrderProductStore): void {
  store.products.set(P1, createProduct({ id: P1, productCode: 1001, name: "Pantalla A15", categoryId: "cat-repuestos", priceAmount: 100, priceCurrency: "UYU", stock: 5 }));
  store.products.set(P2, createProduct({ id: P2, productCode: 1002, name: "Bateria B20", categoryId: "cat-repuestos", priceAmount: 50, priceCurrency: "UYU", stock: 3 }));
  store.lots.set(P1, [mkLot(L1, P1, 5)]);
  store.lots.set(P2, [mkLot(L2, P2, 3)]);
}

describe("orders handler (Unit 6)", () => {
  it("creates a webshop order with pending checkout and fresh preference in one run", async () => {
    const { uow, products, ventas, pagos, gateway, handler } = setup();
    seedOrders(products);

    const result = await handler.createOrder({
      orderId: "order-1",
      lines: [{ productId: P1, quantity: 2 }, { productId: P2, quantity: 1 }]
    });

    expect(uow.runs).toBe(1);
    expect(result.venta.channel).toBe("webshop");
    expect(result.venta.status).toBe("Pendiente");
    expect(result.venta.total).toEqual({ amount: 250, currency: "UYU" });
    expect(result.venta.stockCommitted).toBe(false);
    expect(result.venta.checkoutSession).toEqual({
      id: "cs-1", ventaId: "order-1", status: "pending",
      createdAt: NOW, expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000)
    });
    expect(result.pago).toEqual({
      orderId: "order-1", preferenceId: "pref-order-1-1",
      paymentId: null, paidAt: null, total: { amount: 250, currency: "UYU" }
    });
    expect(gateway.calls).toBe(1);
    expect(ventas.saves).toBe(1);
    expect(pagos.saves).toBe(1);
    const seen = [...products.seenTx, ...ventas.seenTx, ...pagos.seenTx];
    expect(seen.every((tx) => tx === uow.tx)).toBe(true);
  });

  it("reserves nothing: stock and lots untouched, webhook-only payment absent", async () => {
    const { products, handler } = setup();
    seedOrders(products);

    const result = await handler.createOrder({ orderId: "order-2", lines: [{ productId: P1, quantity: 2 }] });

    expect(products.products.get(createProductId(P1))?.stock).toBe(5);
    expect(products.lots.get(P1)?.[0].remainingQty).toBe(5);
    expect(result.venta.stockCommitted).toBe(false);
    expect(result.venta.status).toBe("Pendiente");
    expect(result.venta.paymentRef).toBeNull();
    expect(result.venta.paidAt).toBeNull();
    expect(result.venta.payments).toEqual([]);
    expect(result.pago.paymentId).toBeNull();
    expect(result.pago.paidAt).toBeNull();
  });

  it("rejects a second pending session with 409 and zero new saves", async () => {
    const { products, ventas, pagos, gateway, handler } = setup();
    seedOrders(products);

    await handler.createOrder({ orderId: "order-3", lines: [{ productId: P1, quantity: 1 }] });
    const error = await handler.mintCheckoutSession({ orderId: "order-3" }).then(() => null, (err: unknown) => err);

    expect(error).toBeInstanceOf(ConflictError);
    expect(gateway.calls).toBe(1);
    expect(ventas.saves).toBe(1);
    expect(pagos.saves).toBe(1);
  });

  it("mints a fresh preference over a cancelled session in one run", async () => {
    const { uow, products, ventas, pagos, gateway, handler } = setup();
    seedOrders(products);

    await handler.createOrder({ orderId: "order-4", lines: [{ productId: P1, quantity: 1 }] });
    const current = ventas.stored.get("order-4");
    expect(current).toBeDefined();
    ventas.stored.set("order-4", cancelCheckoutSession(current as Venta));

    const result = await handler.mintCheckoutSession({ orderId: "order-4" });

    expect(uow.runs).toBe(2);
    expect(result.venta.checkoutSession?.id).toBe("cs-2");
    expect(result.venta.checkoutSession?.status).toBe("pending");
    expect(result.pago.preferenceId).toBe("pref-order-4-2");
    expect(ventas.saves).toBe(2);
    expect(pagos.saves).toBe(2);
    expect(gateway.calls).toBe(2);
  });

  it("fails a lot shortfall with 409 and zero saves", async () => {
    const { uow, products, ventas, pagos, gateway, handler } = setup();
    seedOrders(products);

    const error = await handler
      .createOrder({ orderId: "order-5", lines: [{ productId: P2, quantity: 9 }] })
      .then(() => null, (err: unknown) => err);

    expect(error).toBeInstanceOf(InsufficientStockError);
    expect(uow.runs).toBe(1);
    expect(ventas.saves).toBe(0);
    expect(pagos.saves).toBe(0);
    expect(gateway.calls).toBe(0);
    expect(products.products.get(createProductId(P2))?.stock).toBe(3);
    expect(products.lots.get(P2)?.[0].remainingQty).toBe(3);
  });

  it("passes an unknown line product through as 404 with zero saves", async () => {
    const { uow, products, ventas, pagos, gateway, handler } = setup();
    seedOrders(products);

    const error = await handler
      .createOrder({ orderId: "order-6", lines: [{ productId: "prod-unknown", quantity: 1 }] })
      .then(() => null, (err: unknown) => err);

    expect(error).toBeInstanceOf(NotFoundError);
    expect(uow.runs).toBe(1);
    expect(ventas.saves).toBe(0);
    expect(pagos.saves).toBe(0);
    expect(gateway.calls).toBe(0);
  });
});
