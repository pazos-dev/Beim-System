import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "../shared/errors";
import type { OrderActor } from "../shared/order-context";
import { OrdenController } from "../ordenes/orden-controller";
import { OrdenUseCases } from "../ordenes/orden-use-cases";
import { createOrdenController, createOrdenUseCases } from "./ordenes.composition";

const admin: OrderActor = { id: "u-administrador", role: "administrador", hasGlobalAccess: true };

describe("ordenes.composition", () => {
  it("wires port to use-case to controller with a single backend choice", async () => {
    const useCases = createOrdenUseCases("/tmp/gestion-ordenes-composition");
    const controller = createOrdenController("/tmp/gestion-ordenes-composition");
    expect(useCases).toBeInstanceOf(OrdenUseCases);
    expect(controller).toBeInstanceOf(OrdenController);
    const rejected = await controller.list(admin, { page: 0 });
    expect(rejected.status).toBe(400);
    expect(rejected.body).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.VALIDATION_ERROR }
    });
  });
});
