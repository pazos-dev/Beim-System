import { describe, expect, it } from "vitest";

import {
  ConflictError,
  InsufficientStockError,
  ValidationError
} from "../../errors/taxonomy.js";
import { createMoney } from "../shared/types.js";
import { createStockLot } from "../product/stock-lot.js";
import {
  addVentaPayment,
  cancelVenta,
  confirmVenta,
  createVenta,
  markPaidVenta,
  openCheckoutSession,
  priceVenta,
  type Venta,
  type VentaLotLane
} from "./venta.js";

const LOT_DATE = new Date("2026-01-01T00:00:00.000Z");

function draftMostrador(): Venta {
  return createVenta({
    id: "v-1",
    channel: "mostrador",
    lines: [
      { productId: "p-1", quantity: 2 },
      { productId: "p-2", quantity: 1 }
    ]
  });
}

/** Server-side resolver: locked catalog prices, never client input. */
function priced(venta: Venta): Venta {
  return priceVenta(venta, (line) =>
    line.productId === "p-1"
      ? createMoney(100, "UYU")
      : createMoney(50, "UYU")
  );
}

function lane(lotId: string, remaining: number): VentaLotLane {
  return {
    lots: [
      createStockLot({
        id: lotId,
        productId: "p-1",
        initialQty: remaining,
        unitCostAmount: 10,
        unitCostCurrency: "UYU",
        purpose: "venta",
        createdAt: LOT_DATE
      })
    ],
    price: createMoney(100, "UYU")
  };
}

function lanes(): Map<string, VentaLotLane> {
  return new Map([
    ["p-1", lane("l-1", 5)],
    [
      "p-2",
      {
        lots: [
          createStockLot({
            id: "l-2",
            productId: "p-2",
            initialQty: 3,
            unitCostAmount: 5,
            unitCostCurrency: "UYU",
            purpose: "venta",
            createdAt: LOT_DATE
          })
        ],
        price: createMoney(50, "UYU")
      }
    ]
  ]);
}

describe("Venta aggregate (domain slice)", () => {
  it("rejects empty lines, duplicate products, and non-positive quantities", () => {
    expect(() =>
      createVenta({ id: "v-1", channel: "mostrador", lines: [] })
    ).toThrow(ValidationError);
    expect(() =>
      createVenta({
        id: "v-1",
        channel: "mostrador",
        lines: [
          { productId: "p-1", quantity: 1 },
          { productId: "p-1", quantity: 1 }
        ]
      })
    ).toThrow(ValidationError);
    expect(() =>
      createVenta({
        id: "v-1",
        channel: "mostrador",
        lines: [{ productId: "p-1", quantity: 0 }]
      })
    ).toThrow(ValidationError);
  });

  it("prices server-side: total comes from the resolver, never the client", () => {
    const venta = priced(draftMostrador());

    expect(venta.total).toEqual({ amount: 250, currency: "UYU" });
    expect(venta.lines.map((line) => line.unitPrice)).toEqual([
      { amount: 100, currency: "UYU" },
      { amount: 50, currency: "UYU" }
    ]);
  });

  it("confirms a mostrador sale with exact payments and commits venta lots", () => {
    const stock = lanes();
    let venta = priced(draftMostrador());
    venta = addVentaPayment(venta, {
      method: "efectivo",
      amount: createMoney(250, "UYU")
    });

    const { venta: confirmed, lots } = confirmVenta(venta, stock);

    expect(confirmed.stockCommitted).toBe(true);
    expect(lots.get("p-1")?.[0].remainingQty).toBe(3);
    expect(confirmed.lines[0].allocations).toEqual([
      { lotId: "l-1", qty: 2, unitPrice: { amount: 100, currency: "UYU" } }
    ]);
  });

  it("accepts payments within ±0.001 but rejects beyond tolerance", () => {
    const exact = addVentaPayment(priced(draftMostrador()), {
      method: "efectivo",
      amount: createMoney(250.0009, "UYU")
    });
    expect(() => confirmVenta(exact, lanes())).not.toThrow();

    const short = addVentaPayment(priced(draftMostrador()), {
      method: "efectivo",
      amount: createMoney(249.99, "UYU")
    });
    expect(() => confirmVenta(short, lanes())).toThrow(ValidationError);
  });

  it("maps a venta-lot shortfall to INSUFFICIENT_STOCK 409", () => {
    let venta = priced(draftMostrador());
    venta = addVentaPayment(venta, {
      method: "efectivo",
      amount: createMoney(250, "UYU")
    });
    const stock = new Map([["p-1", lane("l-1", 1)]]);

    try {
      confirmVenta(venta, stock);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStockError);
      expect((error as InsufficientStockError).code).toBe("INSUFFICIENT_STOCK");
      expect((error as InsufficientStockError).status).toBe(409);
    }
  });

  it("cancels idempotently with no auto-refund or stock restore", () => {
    const once = cancelVenta(draftMostrador());
    const twice = cancelVenta(once);

    expect(once.status).toBe("Cancelada");
    expect(twice).toEqual(once);
  });

  it("answers 409 on a second pending checkout session", () => {
    const opened = openCheckoutSession(draftMostrador(), {
      sessionId: "s-1",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      expiresAt: new Date("2026-02-02T00:00:00.000Z")
    });

    expect(() =>
      openCheckoutSession(opened, {
        sessionId: "s-2",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        expiresAt: new Date("2026-02-02T00:00:00.000Z")
      })
    ).toThrow(ConflictError);
    try {
      openCheckoutSession(opened, {
        sessionId: "s-2",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        expiresAt: new Date("2026-02-02T00:00:00.000Z")
      });
      expect.unreachable();
    } catch (error) {
      expect((error as ConflictError).code).toBe("CONFLICT");
      expect((error as ConflictError).status).toBe(409);
    }
  });

  it("checks but never reserves stock for webshop sales", () => {
    const webshop = priced(
      createVenta({
        id: "v-9",
        channel: "webshop",
        lines: [{ productId: "p-1", quantity: 2 }]
      })
    );

    const { venta: confirmed, lots } = confirmVenta(webshop, lanes());

    expect(confirmed.stockCommitted).toBe(false);
    expect(lots.get("p-1")?.[0].remainingQty).toBe(5);
    expect(confirmed.lines[0].allocations).toEqual([]);
  });

  it("marks paid via webhook only, idempotent on the same reference", () => {
    const paid = markPaidVenta(draftMostrador(), {
      paymentRef: "mp-1",
      paidAt: new Date("2026-03-01T00:00:00.000Z")
    });

    expect(paid.status).toBe("Pagada");
    expect(markPaidVenta(paid, {
      paymentRef: "mp-1",
      paidAt: new Date("2026-03-01T00:00:00.000Z")
    })).toEqual(paid);
    expect(() =>
      markPaidVenta(paid, {
        paymentRef: "mp-2",
        paidAt: new Date("2026-03-01T00:00:00.000Z")
      })
    ).toThrow(ConflictError);
    expect(() =>
      markPaidVenta(cancelVenta(draftMostrador()), {
        paymentRef: "mp-1",
        paidAt: new Date("2026-03-01T00:00:00.000Z")
      })
    ).toThrow(ValidationError);
  });

  it("lets manual lines skip stock lanes entirely", () => {
    let venta = priced(
      createVenta({
        id: "v-7",
        channel: "mostrador",
        lines: [{ productId: null, quantity: 1 }]
      })
    );
    venta = addVentaPayment(venta, {
      method: "efectivo",
      amount: createMoney(50, "UYU")
    });

    expect(() => confirmVenta(venta, new Map())).not.toThrow();
  });
});
