import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS,
  canTransitionOrder,
  createOrderInputSchema,
  nextOrderNumero,
  transitionOrder
} from "./orden.js";

describe("order state machine", () => {
  it("allows the forward repair flow step by step", () => {
    const flow: Array<[string, string]> = [
      [ORDER_STATUS.EN_DIAGNOSTICO, ORDER_STATUS.PRESUPUESTADO],
      [ORDER_STATUS.PRESUPUESTADO, ORDER_STATUS.ESPERANDO_APROBACION],
      [ORDER_STATUS.ESPERANDO_APROBACION, ORDER_STATUS.APROBADO],
      [ORDER_STATUS.APROBADO, ORDER_STATUS.EN_REPARACION],
      [ORDER_STATUS.EN_REPARACION, ORDER_STATUS.CONTROL_CALIDAD],
      [ORDER_STATUS.CONTROL_CALIDAD, ORDER_STATUS.LISTO_PARA_RETIRAR],
      [ORDER_STATUS.LISTO_PARA_RETIRAR, ORDER_STATUS.FINALIZADO],
      [ORDER_STATUS.FINALIZADO, ORDER_STATUS.ENTREGADO]
    ];
    for (const [from, to] of flow) {
      expect(canTransitionOrder(from, to)).toBe(true);
    }
  });

  it("allows waiting-for-parts and rework loops", () => {
    expect(canTransitionOrder(ORDER_STATUS.APROBADO, ORDER_STATUS.ESPERANDO_REPUESTO)).toBe(true);
    expect(canTransitionOrder(ORDER_STATUS.ESPERANDO_REPUESTO, ORDER_STATUS.EN_REPARACION)).toBe(true);
    expect(canTransitionOrder(ORDER_STATUS.EN_REPARACION, ORDER_STATUS.ESPERANDO_REPUESTO)).toBe(true);
    expect(canTransitionOrder(ORDER_STATUS.CONTROL_CALIDAD, ORDER_STATUS.EN_REPARACION)).toBe(true);
  });

  it("allows cancellation from any non-terminal state", () => {
    const open = [
      ORDER_STATUS.EN_DIAGNOSTICO,
      ORDER_STATUS.PRESUPUESTADO,
      ORDER_STATUS.ESPERANDO_APROBACION,
      ORDER_STATUS.APROBADO,
      ORDER_STATUS.ESPERANDO_REPUESTO,
      ORDER_STATUS.EN_REPARACION,
      ORDER_STATUS.CONTROL_CALIDAD,
      ORDER_STATUS.LISTO_PARA_RETIRAR,
      ORDER_STATUS.FINALIZADO
    ];
    for (const from of open) {
      expect(canTransitionOrder(from, ORDER_STATUS.CANCELADO)).toBe(true);
    }
  });

  it("rejects skips, backward jumps and any move from a terminal state", () => {
    expect(canTransitionOrder(ORDER_STATUS.EN_DIAGNOSTICO, ORDER_STATUS.ENTREGADO)).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.PRESUPUESTADO, ORDER_STATUS.EN_REPARACION)).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.APROBADO, ORDER_STATUS.PRESUPUESTADO)).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.ENTREGADO, ORDER_STATUS.EN_REPARACION)).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.ENTREGADO, ORDER_STATUS.CANCELADO)).toBe(false);
    expect(canTransitionOrder(ORDER_STATUS.CANCELADO, ORDER_STATUS.EN_DIAGNOSTICO)).toBe(false);
    expect(canTransitionOrder("no-existe", ORDER_STATUS.ENTREGADO)).toBe(false);
  });

  it("applies a valid transition and rejects an invalid one without mutating", () => {
    const applied = transitionOrder(ORDER_STATUS.EN_DIAGNOSTICO, ORDER_STATUS.PRESUPUESTADO);
    expect(applied).toMatchObject({ ok: true, value: ORDER_STATUS.PRESUPUESTADO });

    const rejected = transitionOrder(ORDER_STATUS.EN_DIAGNOSTICO, ORDER_STATUS.ENTREGADO);
    expect(rejected).toMatchObject({ ok: false });
    if (!rejected.ok) expect(rejected.error.code).toBe("CONFLICT");
  });
});

describe("order creation edge validation", () => {
  it("rejects incomplete payloads with Zod at the edge", () => {
    expect(createOrderInputSchema.safeParse({}).success).toBe(false);
    expect(
      createOrderInputSchema.safeParse({ clienteId: "c_1", total: 900 }).success
    ).toBe(true);
    expect(
      createOrderInputSchema.safeParse({ clienteId: "c_1", total: -5 }).success
    ).toBe(false);
  });

  it("generates the next numero without colliding with existing ones", () => {
    expect(nextOrderNumero(["0001-000001", "0001-000002"])).toBe("0001-000003");
    expect(nextOrderNumero([])).toBe("0001-000001");
  });
});
