import { describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "../shared/errors";
import { err, ok } from "../shared/result";
import type { OrderActor } from "../shared/order-context";
import type { Orden } from "../data/schemas";
import type { OrderListResponse, OrderListViewQuery } from "./orders-handler";
import type { OrdenRepositoryPort } from "./orden-port";
import { OrdenUseCases } from "./orden-use-cases";

const admin: OrderActor = { id: "u-administrador", role: "administrador", hasGlobalAccess: true };
const caja: OrderActor = { id: "u-caja", role: "caja", hasGlobalAccess: false };

const LIST_ALL: OrderListViewQuery = {
  dir: "asc",
  estado: "todas",
  page: 1,
  pageSize: 25,
  sort: "numero"
};

function stubPort(overrides: Partial<OrdenRepositoryPort> = {}): OrdenRepositoryPort & {
  calls: { create: number; getById: number; list: number };
} {
  const calls = { create: 0, getById: 0, list: 0 };
  return {
    calls,
    create: async () => {
      calls.create += 1;
      return ok({ id: "o_stub" }) as unknown as ReturnType<OrdenRepositoryPort["create"]> extends Promise<infer T>
        ? Promise<T>
        : never;
    },
    getById: async () => {
      calls.getById += 1;
      return err({ code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN, message: "missing" });
    },
    list: async () => {
      calls.list += 1;
      return ok({
        canViewBoleta: false,
        counts: {},
        items: [],
        page: 1,
        pageSize: 25,
        totalItems: 0
      } as unknown as OrderListResponse);
    },
    ...overrides
  };
}

describe("OrdenUseCases delegation", () => {
  it("returns the port list envelope unchanged", async () => {
    const port = stubPort();
    const useCases = new OrdenUseCases(port);
    const result = await useCases.list(admin, LIST_ALL);
    expect(result.ok).toBe(true);
    expect(port.calls.list).toBe(1);
    if (result.ok) expect(result.value.totalItems).toBe(0);
  });

  it("returns the port detail error code unchanged", async () => {
    const port = stubPort();
    const useCases = new OrdenUseCases(port);
    const result = await useCases.getById(admin, "o_1");
    expect(result).toMatchObject({ ok: false, error: { code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN } });
    expect(port.calls.getById).toBe(1);
  });

  it("delegates authorized creates with the identical envelope", async () => {
    const created = { id: "o_new" } as unknown as Orden;
    const port = stubPort({ create: async () => ok(created) });
    const useCases = new OrdenUseCases(port);
    const result = await useCases.create(admin, { clienteId: "c_1", total: 50 });
    expect(result).toEqual(ok(created));
  });

  it("rejects creates from roles outside ORDER_CREATE_ROLES without touching the port", async () => {
    const create = vi.fn(async () => ok({ id: "o_new" } as unknown as Orden));
    const port = stubPort({ create });
    const useCases = new OrdenUseCases(port);
    const result = await useCases.create(caja, { clienteId: "c_1", total: 50 });
    expect(result).toMatchObject({ ok: false, error: { code: ERROR_CODES.FORBIDDEN } });
    expect(create).not.toHaveBeenCalled();
  });
});
