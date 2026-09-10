import { describe, expect, it } from "vitest";

import { NotFoundError } from "../../domain/shared/errors.js";
import type { CashSession } from "../../domain/cash-session/cash-session.js";
import type { ProductId } from "../../domain/shared/types.js";
import { createProduct } from "../../domain/product/product.js";
import { createStockLot } from "../../domain/product/stock-lot.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { Receipt } from "../../domain/receipt/receipt.js";
import type { Client } from "../../domain/user/user.js";
import type { Venta } from "../../domain/venta/venta.js";
import { makeQueryHandlers } from "./queries.js";
import type {
  Paged,
  QueriesCashReader,
  QueriesCatalogReader,
  QueriesClientReader,
  QueriesReceiptReader,
  QueriesVentaReader
} from "./ports.js";

const UID = "c3333333-3333-4333-8333-333333333333";
const PRODUCT_ID = "d4444444-4444-4444-8444-444444444444";

function client(): Client {
  return { id: UID as Client["id"], name: "Ada", email: null, phone: null, ci: null, rut: null, isApproved: true };
}

function venta(id: string): Venta {
  return {
    id,
    channel: "mostrador",
    status: "Pendiente",
    lines: [],
    payments: [],
    checkoutSession: null,
    stockCommitted: false,
    total: null,
    paymentRef: null,
    paidAt: null,
    customer: null,
    email: null,
    phone: null,
    ci: null,
    rut: null,
    address: null,
    shipping: null,
    comments: null,
    userId: null,
    clientName: null,
    clientId: null,
    deviceBrand: null,
    deviceModel: null,
    imeiSerial: null,
    reportedIssue: null,
    services: null
  };
}

function catalogRow(): ProductWithLots {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  return {
    product: createProduct({ id: PRODUCT_ID, productCode: 7, name: "Teclado", categoryId: "cat-1", priceAmount: 100, priceCurrency: "UYU", stock: 5 }),
    lots: [
      createStockLot({ id: "l-1", productId: PRODUCT_ID, initialQty: 10, remainingQty: 3, unitCostAmount: 50, unitCostCurrency: "UYU", purpose: "venta", createdAt }),
      createStockLot({ id: "l-2", productId: PRODUCT_ID, initialQty: 10, remainingQty: 2, unitCostAmount: 50, unitCostCurrency: "UYU", purpose: "taller", createdAt })
    ]
  };
}

function receipt(): Receipt {
  return {
    id: "r-1",
    receiptNumber: 1000,
    userId: null,
    repairStatus: "Ingresado",
    paymentStatus: "Pendiente",
    price: "100",
    parts: [
      {
        id: "p-1",
        receiptId: "r-1",
        productId: PRODUCT_ID as ProductId,
        quantity: 1,
        unitPrice: { amount: 100, currency: "UYU" },
        stockDecremented: false,
        allocations: []
      }
    ],
    payments: [{ id: "pay-1", receiptId: "r-1", amount: { amount: 100, currency: "UYU" }, method: "efectivo", reference: null }],
    checklists: []
  };
}

function cashSession(): CashSession {
  return {
    id: "c-1",
    businessDate: "2026-09-09",
    openingAmount: 1000,
    expectedAmount: 1200,
    countedAmount: null,
    difference: null,
    status: "open",
    notes: "",
    movements: [{ type: "ingreso", amount: 200 }]
  };
}

class FakeClients implements QueriesClientReader {
  constructor(private readonly found: Client | null) {}
  findClient(): Promise<Client | null> {
    return Promise.resolve(this.found);
  }
}

class FakeVentas implements QueriesVentaReader {
  seen: Array<{ clientId: string; page: { page: number; limit: number; offset: number } }> = [];
  constructor(private readonly items: readonly Venta[]) {}
  async listOpenByClient(clientId: string, page: { page: number; limit: number; offset: number }): Promise<Paged<Venta>> {
    this.seen.push({ clientId, page });
    return { items: this.items, total: this.items.length };
  }
}

class FakeCatalog implements QueriesCatalogReader {
  constructor(private readonly rows: readonly ProductWithLots[]) {}
  async listProductsWithLots(): Promise<Paged<ProductWithLots>> {
    return { items: this.rows, total: this.rows.length };
  }
}

class FakeReceipts implements QueriesReceiptReader {
  constructor(private readonly found: Receipt | null) {}
  findReceipt(): Promise<Receipt | null> {
    return Promise.resolve(this.found);
  }
}

class FakeCash implements QueriesCashReader {
  constructor(private readonly found: CashSession | null) {}
  findCashSession(): Promise<CashSession | null> {
    return Promise.resolve(this.found);
  }
}

function setup(overrides?: { foundClient?: Client | null; ventas?: readonly Venta[]; foundCash?: CashSession | null }) {
  const clients = new FakeClients(overrides?.foundClient ?? client());
  const ventas = new FakeVentas(overrides?.ventas ?? [venta("v-1"), venta("v-2")]);
  const catalog = new FakeCatalog([catalogRow()]);
  const receipts = new FakeReceipts(receipt());
  const cash = new FakeCash(overrides?.foundCash ?? cashSession());
  const handlers = makeQueryHandlers({ clients, ventas, catalog, receipts, cash });
  return { ventas, handlers };
}

function setupMissing() {
  return makeQueryHandlers({
    clients: new FakeClients(null),
    ventas: new FakeVentas([]),
    catalog: new FakeCatalog([]),
    receipts: new FakeReceipts(null),
    cash: new FakeCash(null)
  });
}

describe("query handlers (Unit 11, 5.2 composition)", () => {
  it("composes client with open sales defaulting pagination to 1/20", async () => {
    const { ventas, handlers } = setup();
    const result = await handlers.getClientWithOpenSales({ clientId: UID });
    expect(result.client.name).toBe("Ada");
    expect(result.ventas).toHaveLength(2);
    expect(result).toMatchObject({ total: 2, page: 1, limit: 20 });
    expect(ventas.seen).toMatchObject([{ clientId: UID, page: { page: 1, limit: 20, offset: 0 } }]);
  });

  it("clamps page to >= 1 and limit to <= 100", async () => {
    const { ventas, handlers } = setup();
    const result = await handlers.getClientWithOpenSales({ clientId: UID, page: 0, limit: 500 });
    expect(result).toMatchObject({ page: 1, limit: 100 });
    expect(ventas.seen[0]?.page).toMatchObject({ page: 1, limit: 100, offset: 0 });
  });

  it("throws 404 without touching ventas when the client is missing", async () => {
    const ventas = new FakeVentas([venta("v-1")]);
    const handlers = makeQueryHandlers({
      clients: new FakeClients(null),
      ventas,
      catalog: new FakeCatalog([]),
      receipts: new FakeReceipts(null),
      cash: new FakeCash(null)
    });
    await expect(handlers.getClientWithOpenSales({ clientId: UID })).rejects.toBeInstanceOf(NotFoundError);
    expect(ventas.seen).toHaveLength(0);
  });

  it("maps catalog lots to availableVenta/availableTaller without mutating", async () => {
    const { handlers } = setup();
    const result = await handlers.listCatalogWithAvailability({});
    expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(result.items[0]).toMatchObject({ availableVenta: 3, availableTaller: 2 });
    expect(result.items[0]?.product.name).toBe("Teclado");
  });

  it("returns the receipt with parts and payments via the root", async () => {
    const { handlers } = setup();
    const found = await handlers.getReceiptDetail({ receiptId: "r-1" });
    expect(found.parts).toHaveLength(1);
    expect(found.payments).toHaveLength(1);
  });

  it("returns the cash session with movements, 404 when receipt/session missing", async () => {
    const { handlers } = setup();
    const found = await handlers.getCashSessionDetail({ sessionId: "c-1" });
    expect(found.movements).toHaveLength(1);
    const missing = setupMissing();
    await expect(missing.getReceiptDetail({ receiptId: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(missing.getCashSessionDetail({ sessionId: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
