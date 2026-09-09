import { describe, expect, it, vi } from "vitest";
import { makePurchaseHandlers, type PurchasesStore } from "./purchases.js";

function stubStore(): PurchasesStore & {
  list: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn(async (filter: unknown) => ({ items: [], filter })),
    getById: vi.fn(async (id: unknown) => ({ id })),
    create: vi.fn(async (input: unknown, actor: unknown) => ({ created: true, input, actor })),
    update: vi.fn(async (id: unknown, patch: unknown) => ({ updated: true, id, patch }))
  };
}

const ACTOR = { actorUserId: "123e4567-e89b-12d3-a456-426614174000", actorRole: "administrador" };

describe("purchase thin handlers (pass-through over the driven port)", () => {
  it("lists through the store with the received filter", async () => {
    const store = stubStore();
    const handlers = makePurchaseHandlers(store);
    await expect(handlers.list({ active: "all" })).resolves.toEqual({ items: [], filter: { active: "all" } });
    expect(store.list).toHaveBeenCalledWith({ active: "all" });
  });

  it("gets by id through the store", async () => {
    const store = stubStore();
    const handlers = makePurchaseHandlers(store);
    const id = "123e4567-e89b-12d3-a456-426614174000";
    await expect(handlers.getById(id)).resolves.toEqual({ id });
    expect(store.getById).toHaveBeenCalledWith(id);
  });

  it("creates through the store with input plus audit actor", async () => {
    const store = stubStore();
    const handlers = makePurchaseHandlers(store);
    const input = { supplierName: "Proveedor Uno" };
    await expect(handlers.create(input, ACTOR)).resolves.toEqual({ created: true, input, actor: ACTOR });
    expect(store.create).toHaveBeenCalledWith(input, ACTOR);
  });

  it("updates through the store with id plus patch and no actor", async () => {
    const store = stubStore();
    const handlers = makePurchaseHandlers(store);
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const patch = { supplierName: "Proveedor Dos" };
    await expect(handlers.update(id, patch)).resolves.toEqual({ updated: true, id, patch });
    expect(store.update).toHaveBeenCalledWith(id, patch);
  });
});
