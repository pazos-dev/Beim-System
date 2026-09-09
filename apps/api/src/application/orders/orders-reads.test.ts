import { describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../../domain/shared/errors.js";
import type { OrdersReadsPort } from "./orders-reads.js";
import { makeOrdersReadsHandlers } from "./orders-reads.js";

const USER = "user-1";

function basePort(): OrdersReadsPort {
  return {
    listMine: vi.fn(async (_userId: string, query: unknown) => ({ query })),
    getMine: vi.fn(async (_userId: string, id: string) => ({ id })),
    cancel: vi.fn(async (_userId: string, id: string) => ({ order: { id } }))
  };
}

describe("orders reads handlers (thin delegation over the read port)", () => {
  it("forwards listMine with the owner and query untouched", async () => {
    const port = basePort();
    await makeOrdersReadsHandlers(port).listMine(USER, { page: 2, limit: 10 });
    expect(port.listMine).toHaveBeenCalledWith(USER, { page: 2, limit: 10 });
  });

  it("forwards getMine and bubbles null (router owns the 404)", async () => {
    const port = basePort();
    port.getMine = vi.fn(async () => null);
    await expect(makeOrdersReadsHandlers(port).getMine(USER, "order-1")).resolves.toBeNull();
    expect(port.getMine).toHaveBeenCalledWith(USER, "order-1");
  });

  it("forwards cancel with the owner and order id", async () => {
    const port = basePort();
    const result = await makeOrdersReadsHandlers(port).cancel(USER, "order-9");
    expect(port.cancel).toHaveBeenCalledWith(USER, "order-9");
    expect(result).toEqual({ order: { id: "order-9" } });
  });

  it("bubbles reader failures by identity: 404 on missing, 409 on conflict (no remap)", async () => {
    const missing = new NotFoundError("Orden no encontrada: order-x");
    const conflict = new ConflictError("La orden ya no se puede cancelar");
    const port = basePort();
    port.getMine = vi.fn(async () => {
      throw missing;
    });
    port.cancel = vi.fn(async () => {
      throw conflict;
    });
    await expect(makeOrdersReadsHandlers(port).getMine(USER, "order-x")).rejects.toBe(missing);
    await expect(makeOrdersReadsHandlers(port).cancel(USER, "order-x")).rejects.toBe(conflict);
  });
});
