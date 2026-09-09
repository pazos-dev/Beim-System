import { describe, expect, it } from "vitest";

import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import { createServiceId, type ServiceId } from "../../domain/shared/types.js";
import { NotFoundError, ValidationError } from "../../domain/shared/errors.js";
import { createService, type Service } from "../../domain/service/service.js";
import { makeCatalogServiceHandlers } from "./service-handlers.js";
import type { CatalogServiceStore } from "./ports.js";

const SERVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeCatalogServiceStore implements CatalogServiceStore {
  services = new Map<string, Service>();
  seenTx: TxClient[] = [];
  saves = 0;

  private touch(tx: TxClient): void {
    this.seenTx.push(tx);
  }

  async findService(tx: TxClient, id: ServiceId): Promise<Service | null> {
    this.touch(tx);
    return this.services.get(id) ?? null;
  }

  async saveService(tx: TxClient, service: Service): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.services.set(service.id, service);
  }
}

function setup() {
  const uow = new FakeUnitOfWork();
  const store = new FakeCatalogServiceStore();
  const handlers = makeCatalogServiceHandlers({ uow, services: store });
  return { uow, store, handlers };
}

function seedService(store: FakeCatalogServiceStore): Service {
  const service = createService({
    id: SERVICE_ID,
    name: "Mano de obra",
    priceAmount: 500,
    priceCurrency: "UYU"
  });
  store.services.set(SERVICE_ID, service);
  return service;
}

describe("makeCatalogServiceHandlers", () => {
  it("creates a service in one run and persists it", async () => {
    const { uow, store, handlers } = setup();
    const created = await handlers.create({
      id: SERVICE_ID,
      name: "Mano de obra",
      priceAmount: 500,
      priceCurrency: "UYU"
    });
    expect(created.name).toBe("Mano de obra");
    expect(created.price).toEqual({ amount: 500, currency: "UYU" });
    expect(created.active).toBe(true);
    expect(uow.runs).toBe(1);
    expect(store.saves).toBe(1);
    expect(store.services.get(SERVICE_ID)).toEqual(created);
    expect(store.seenTx.every((tx) => tx === uow.tx)).toBe(true);
  });

  it("renames via renameService keeping price, flag, and data", async () => {
    const { uow, store, handlers } = setup();
    seedService(store);
    const renamed = await handlers.rename({ serviceId: SERVICE_ID, name: "Reparación" });
    expect(renamed.name).toBe("Reparación");
    expect(renamed.price).toEqual({ amount: 500, currency: "UYU" });
    expect(renamed.active).toBe(true);
    expect(uow.runs).toBe(1);
    expect(store.saves).toBe(1);
  });

  it("reprices via repriceService in the entry currency", async () => {
    const { uow, store, handlers } = setup();
    seedService(store);
    const repriced = await handlers.reprice({ serviceId: SERVICE_ID, amount: 750 });
    expect(repriced.price).toEqual({ amount: 750, currency: "UYU" });
    expect(repriced.name).toBe("Mano de obra");
    expect(uow.runs).toBe(1);
    expect(store.saves).toBe(1);
  });

  it("updates via updateService merging only present fields", async () => {
    const { uow, store, handlers } = setup();
    seedService(store);
    const updated = await handlers.update({
      serviceId: SERVICE_ID,
      patch: { name: "Service Plus", active: false }
    });
    expect(updated.name).toBe("Service Plus");
    expect(updated.active).toBe(false);
    expect(updated.price).toEqual({ amount: 500, currency: "UYU" });
    expect(uow.runs).toBe(1);
    expect(store.saves).toBe(1);
  });

  it("activates and deactivates via domain behaviors", async () => {
    const { uow, store, handlers } = setup();
    seedService(store);
    const deactivated = await handlers.deactivate({ serviceId: SERVICE_ID });
    expect(deactivated.active).toBe(false);
    const activated = await handlers.activate({ serviceId: SERVICE_ID });
    expect(activated.active).toBe(true);
    expect(uow.runs).toBe(2);
    expect(store.saves).toBe(2);
  });

  it("throws NotFoundError with zero saves when the service is missing", async () => {
    const { uow, store, handlers } = setup();
    await expect(handlers.rename({ serviceId: SERVICE_ID, name: "X" })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(handlers.reprice({ serviceId: SERVICE_ID, amount: 1 })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(
      handlers.update({ serviceId: SERVICE_ID, patch: { name: "X" } })
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(handlers.activate({ serviceId: SERVICE_ID })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(handlers.deactivate({ serviceId: SERVICE_ID })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(store.saves).toBe(0);
    expect(uow.runs).toBe(5);
  });

  it("rejects malformed ids with zero store touch (parsed outside run)", async () => {
    const { uow, store, handlers } = setup();
    await expect(handlers.rename({ serviceId: "not-a-uuid", name: "X" })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(store.seenTx).toHaveLength(0);
    expect(store.saves).toBe(0);
    expect(uow.runs).toBe(0);
    expect(() => createServiceId("not-a-uuid")).toThrow(ValidationError);
  });

  it("passes domain errors through untouched with zero saves", async () => {
    const { store, handlers } = setup();
    seedService(store);
    await expect(handlers.rename({ serviceId: SERVICE_ID, name: "  " })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(handlers.reprice({ serviceId: SERVICE_ID, amount: -1 })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(store.saves).toBe(0);
  });
});
