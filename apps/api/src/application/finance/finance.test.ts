import { describe, expect, it, vi } from "vitest";
import {
  makeFinancialStateHandlers,
  makeInvoiceSettingsHandlers,
  makeStockMovementHandlers,
  type FinancialStateStore,
  type InvoiceSettingsStore,
  type StockMovementsStore
} from "./finance.js";

const ACTOR = { actorUserId: "123e4567-e89b-12d3-a456-426614174000", actorRole: "caja" };

function stubFinancial(): FinancialStateStore & { get: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => ({ singletonId: 1, capitalInitial: 0 })),
    upsert: vi.fn(async (patch: unknown) => ({ singletonId: 1, patch }))
  };
}

function stubInvoices(): InvoiceSettingsStore & { get: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => ({ warranty: "30 días" })),
    save: vi.fn(async (doc: unknown) => ({ saved: true, doc }))
  };
}

function stubStock(): StockMovementsStore & { list: ReturnType<typeof vi.fn>; record: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(async (filter: unknown) => ({ movements: [], filter })),
    record: vi.fn(async (input: unknown, actor: unknown) => ({ recorded: true, input, actor }))
  };
}

describe("financial-state thin handlers (pass-through over the driven port)", () => {
  it("gets the singleton through the store", async () => {
    const store = stubFinancial();
    await expect(makeFinancialStateHandlers(store).get()).resolves.toEqual({
      singletonId: 1,
      capitalInitial: 0
    });
    expect(store.get).toHaveBeenCalledWith();
  });

  it("upserts the partial patch through the store (merge lives in the adapter)", async () => {
    const store = stubFinancial();
    const patch = { capitalInitial: 5000, preferences: { theme: "dark" } };
    await expect(makeFinancialStateHandlers(store).upsert(patch)).resolves.toEqual({
      singletonId: 1,
      patch
    });
    expect(store.upsert).toHaveBeenCalledWith(patch);
  });
});

describe("invoice-settings thin handlers (pass-through over the driven port)", () => {
  it("gets the stored template through the store", async () => {
    const store = stubInvoices();
    await expect(makeInvoiceSettingsHandlers(store).get()).resolves.toEqual({ warranty: "30 días" });
  });

  it("saves the whole document through the store", async () => {
    const store = stubInvoices();
    const doc = { warranty: "90 días por placa" };
    await expect(makeInvoiceSettingsHandlers(store).save(doc)).resolves.toEqual({ saved: true, doc });
    expect(store.save).toHaveBeenCalledWith(doc);
  });
});

describe("stock-movement thin handlers (pass-through over the driven port)", () => {
  it("lists through the store with the received filter", async () => {
    const store = stubStock();
    await expect(
      makeStockMovementHandlers(store).list({ productId: "p1", from: "2026-08-11" })
    ).resolves.toEqual({ movements: [], filter: { productId: "p1", from: "2026-08-11" } });
    expect(store.list).toHaveBeenCalledWith({ productId: "p1", from: "2026-08-11" });
  });

  it("records through the store with input plus audit actor", async () => {
    const store = stubStock();
    const input = { productId: "p1", movementType: "entrada", quantity: 5, detail: "compra" };
    await expect(makeStockMovementHandlers(store).record(input, ACTOR)).resolves.toEqual({
      recorded: true,
      input,
      actor: ACTOR
    });
    expect(store.record).toHaveBeenCalledWith(input, ACTOR);
  });
});
