import { describe, expect, it } from "vitest";

import {
  ORDER_STATUS,
  canTransitionOrder,
  createOrderInputSchema,
  formatEquipment,
  formatEstimatedDisplay,
  nextOrderNumero,
  nextOrderNumeroValue,
  orderFilterCounts,
  ORDER_STATE_FILTERS,
  resolveOrderFilter,
  transitionOrder
} from "./orden";

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

describe("order state filters", () => {
  it("exposes the visible filters in the target HTML order", () => {
    expect(ORDER_STATE_FILTERS.map((filter) => filter.key)).toEqual([
      "todas",
      "abiertas",
      "en_diagnostico",
      "presupuesto",
      "aprobado",
      "espera_repuesto",
      "en_proceso",
      "finalizadas",
      "canceladas"
    ]);
  });

  it("resolves grouped filters to their internal states and null for todas", () => {
    expect(resolveOrderFilter("todas")).toBeNull();
    expect(resolveOrderFilter("abiertas")).toEqual(
      new Set([
        ORDER_STATUS.EN_DIAGNOSTICO,
        ORDER_STATUS.PRESUPUESTADO,
        ORDER_STATUS.ESPERANDO_APROBACION,
        ORDER_STATUS.APROBADO,
        ORDER_STATUS.ESPERANDO_REPUESTO,
        ORDER_STATUS.EN_REPARACION,
        ORDER_STATUS.CONTROL_CALIDAD,
        ORDER_STATUS.LISTO_PARA_RETIRAR
      ])
    );
    expect(resolveOrderFilter("finalizadas")).toEqual(
      new Set([ORDER_STATUS.FINALIZADO, ORDER_STATUS.ENTREGADO])
    );
    expect(resolveOrderFilter("canceladas")).toEqual(new Set([ORDER_STATUS.CANCELADO]));
    expect(resolveOrderFilter("inexistente")).toBeNull();
  });

  it("counts each order in every matching filter, with cancelado only in todas", () => {
    const counts = orderFilterCounts([
      { estado: ORDER_STATUS.EN_DIAGNOSTICO },
      { estado: ORDER_STATUS.EN_DIAGNOSTICO },
      { estado: ORDER_STATUS.PRESUPUESTADO },
      { estado: ORDER_STATUS.ENTREGADO },
      { estado: ORDER_STATUS.CANCELADO }
    ]);
    expect(counts.todas).toBe(5);
    expect(counts.abiertas).toBe(3);
    expect(counts.en_diagnostico).toBe(2);
    expect(counts.presupuesto).toBe(1);
    expect(counts.finalizadas).toBe(1);
    expect(counts.aprobado).toBe(0);
  });
});

describe("order display formatting", () => {
  it("formats equipment from the optional device fields", () => {
    expect(formatEquipment({ deviceBrand: "Samsung", deviceModel: "A54", deviceColor: "Negro" })).toBe(
      "Samsung A54 Negro"
    );
    expect(formatEquipment({ deviceBrand: "Motorola", deviceModel: undefined, deviceColor: "" })).toBe(
      "Motorola"
    );
    expect(formatEquipment({ deviceBrand: undefined, deviceModel: undefined, deviceColor: undefined })).toBe("—");
  });

  it("formats the estimated time display", () => {
    expect(formatEstimatedDisplay({ estimatedTime: 90, estimatedTimeUnit: "min" })).toBe("90 min");
    expect(formatEstimatedDisplay({ estimatedTime: 2, estimatedTimeUnit: "h" })).toBe("2 h");
    expect(formatEstimatedDisplay({ estimatedTime: 1, estimatedTimeUnit: "d" })).toBe("1 día");
    expect(formatEstimatedDisplay({ estimatedTime: 5, estimatedTimeUnit: "d" })).toBe("5 días");
    expect(formatEstimatedDisplay({ estimatedTime: undefined, estimatedTimeUnit: undefined })).toBe("—");
  });

  it("computes the numeric next order value for the boleta iframe", () => {
    expect(nextOrderNumeroValue([])).toBe(1);
    expect(nextOrderNumeroValue(["0001-000001", "0001-000042"])).toBe(43);
  });
});
