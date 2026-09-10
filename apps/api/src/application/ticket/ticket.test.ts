import { describe, expect, it } from "vitest";

import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import { createMoney } from "../../domain/shared/types.js";
import { ConflictError, NotFoundError, ValidationError } from "../../domain/shared/errors.js";
import type { FinancialState } from "../../domain/settings/settings.js";
import type { Venta } from "../../domain/venta/venta.js";
import type { Receipt } from "../../domain/receipt/receipt.js";
import { makeTicketHandlers } from "./ticket.js";
import type { TicketReceiptStore, TicketSettingsStore, TicketVentaStore } from "./ports.js";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeSettingsStore implements TicketSettingsStore {
  seenTx: TxClient[] = [];
  saves = 0;
  loadError: Error | null = null;
  constructor(public state: FinancialState) {}

  async load(tx: TxClient): Promise<FinancialState> {
    this.seenTx.push(tx);
    if (this.loadError !== null) throw this.loadError;
    return this.state;
  }

  async save(tx: TxClient, state: FinancialState): Promise<void> {
    this.seenTx.push(tx);
    this.saves += 1;
    this.state = state;
  }
}

class FakeMapStore<T> {
  seenTx: TxClient[] = [];
  constructor(public items = new Map<string, T>()) {}

  async findById(tx: TxClient, id: string): Promise<T | null> {
    this.seenTx.push(tx);
    return this.items.get(id) ?? null;
  }
}

class FakeVentaStore extends FakeMapStore<Venta> implements TicketVentaStore {}

class FakeReceiptStore extends FakeMapStore<Receipt> implements TicketReceiptStore {}

class FakePdfPort {
  renders = 0;
  async render(): Promise<Uint8Array> {
    this.renders += 1;
    return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  }
}

function baseState(): FinancialState {
  return { singletonId: 1, capitalInitial: 1000 };
}

function sale(id: string): Venta {
  return {
    id,
    channel: "mostrador",
    status: "Pendiente",
    lines: [
      {
        productId: null,
        quantity: 2,
        unitPrice: createMoney(150, "UYU"),
        allocations: []
      }
    ],
    payments: [],
    checkoutSession: null,
    stockCommitted: false,
    total: createMoney(300, "UYU"),
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

function repair(id: string): Receipt {
  return {
    id,
    receiptNumber: 1001,
    userId: null,
    repairStatus: "Listo",
    paymentStatus: "Pendiente",
    price: "400",
    parts: [],
    payments: [],
    checklists: []
  };
}

function setup() {
  const uow = new FakeUnitOfWork();
  const settings = new FakeSettingsStore(baseState());
  const ventas = new FakeVentaStore();
  const receipts = new FakeReceiptStore();
  const pdf = new FakePdfPort();
  const handler = makeTicketHandlers({ uow, settings, ventas, receipts, pdf });
  return { uow, settings, ventas, receipts, pdf, handler };
}

describe("ticket handlers", () => {
  it("merges partial settings keeping capital when absent", async () => {
    const { uow, settings, handler } = setup();
    const next = await handler.updateTicketSettings({ preferences: { theme: "dark" } });
    expect(next.capitalInitial).toBe(1000);
    expect(settings.saves).toBe(1);
    expect(uow.runs).toBe(1);
    expect(settings.seenTx[0]).toBe(uow.tx);
  });

  it("rejects negative capital with 422 and zero saves", async () => {
    const { settings, handler } = setup();
    await expect(handler.updateTicketSettings({ capitalInitial: -5 })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(settings.saves).toBe(0);
  });

  it("builds a sale ticket PDF with merged header and non-fiscal notice", async () => {
    const { uow, ventas, pdf, handler } = setup();
    ventas.items.set("v-1", sale("v-1"));
    const ticket = await handler.buildSaleTicket({ ventaId: "v-1" });
    expect(ticket.document.nonFiscal).toBe(true);
    expect(ticket.document.total).toBe(300);
    expect(ticket.pdf.length).toBeGreaterThan(0);
    expect(uow.runs).toBe(1);
    expect(pdf.renders).toBe(1);
    expect(ventas.seenTx[0]).toBe(uow.tx);
  });

  it("builds a repair ticket PDF marked as non-fiscal workshop record", async () => {
    const { receipts, handler } = setup();
    receipts.items.set("r-1", repair("r-1"));
    const ticket = await handler.buildRepairTicket({ receiptId: "r-1" });
    expect(ticket.document.nonFiscal).toBe(true);
    expect(ticket.document.ticket.id).toBe("r-1");
    expect(ticket.pdf.length).toBeGreaterThan(0);
  });

  it("rejects unknown sales and receipts with 404 before rendering", async () => {
    const { pdf, handler } = setup();
    await expect(handler.buildSaleTicket({ ventaId: "missing" })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(handler.buildRepairTicket({ receiptId: "missing" })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(pdf.renders).toBe(0);
  });

  it("passes catalog errors through unmapped", async () => {
    const { settings, handler } = setup();
    const failure = new ConflictError("Conflicto con el estado actual del recurso");
    settings.loadError = failure;
    const caught = await handler.buildSaleTicket({ ventaId: "v-1" }).catch((error: unknown) => error);
    expect(caught).toBe(failure);
  });
});
