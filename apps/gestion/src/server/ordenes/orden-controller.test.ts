import { describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "../shared/errors";
import { err, ok } from "../shared/result";
import type { OrderActor } from "../shared/order-context";
import type { Orden } from "../data/schemas";
import type { OrdenRepositoryPort } from "./orden-port";
import { OrdenController } from "./orden-controller";
import { OrdenUseCases } from "./orden-use-cases";

const admin: OrderActor = { id: "u-administrador", role: "administrador", hasGlobalAccess: true };
const caja: OrderActor = { id: "u-caja", role: "caja", hasGlobalAccess: false };

function controllerWith(port: Partial<OrdenRepositoryPort>): {
  controller: OrdenController;
  calls: { create: number; getById: number; list: number };
} {
  const calls = { create: 0, getById: 0, list: 0 };
  const full: OrdenRepositoryPort = {
    create: async () => {
      calls.create += 1;
      return ok({ id: "o_new" } as unknown as Orden);
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
      });
    },
    ...port
  };
  return { controller: new OrdenController(new OrdenUseCases(full)), calls };
}

describe("OrdenController boundary", () => {
  it("rejects invalid list queries with frozen status and skips the use-case", async () => {
    const { controller, calls } = controllerWith({});
    const response = await controller.list(admin, { page: 0 });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR } });
    expect(calls.list).toBe(0);
  });

  it("delegates valid list queries with status 200", async () => {
    const { controller, calls } = controllerWith({});
    const response = await controller.list(admin, { estado: "todas" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true });
    expect(calls.list).toBe(1);
  });

  it("rejects blank detail ids with frozen status and skips the use-case", async () => {
    const { controller, calls } = controllerWith({});
    const response = await controller.getById(admin, "   ");
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR } });
    expect(calls.getById).toBe(0);
  });

  it("maps port errors to frozen HTTP statuses", async () => {
    const { controller } = controllerWith({});
    const missing = await controller.getById(admin, "o_missing");
    expect(missing.status).toBe(404);
    const storage = controllerWith({
      getById: async () => err({ code: ERROR_CODES.STORAGE_ERROR, message: "boom" })
    }).controller;
    expect((await storage.getById(admin, "o_1")).status).toBe(500);
  });

  it("rejects invalid create payloads with frozen status and skips the use-case", async () => {
    const create = vi.fn();
    const { controller } = controllerWith({ create });
    const response = await controller.create(admin, { total: -5 });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { code: ERROR_CODES.VALIDATION_ERROR } });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 403 for creates outside ORDER_CREATE_ROLES", async () => {
    const { controller } = controllerWith({});
    const response = await controller.create(caja, { clienteId: "c_1", total: 50 });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ ok: false, error: { code: ERROR_CODES.FORBIDDEN } });
  });

  it("returns 201 for authorized creates", async () => {
    const { controller } = controllerWith({});
    const response = await controller.create(admin, { clienteId: "c_1", total: 50 });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ok: true });
  });
});
