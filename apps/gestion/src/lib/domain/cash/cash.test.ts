import { describe, expect, it } from "vitest";

import { CASH_CLOSE_RESULT, closeCashSession, computeExpected } from "./cash.js";

const FIXTURE_VENTAS = [
  { estado: "confirmada", pagos: [{ metodo: "efectivo", monto: 300 }, { metodo: "tarjeta", monto: 200 }] },
  { estado: "confirmada", pagos: [{ metodo: "efectivo", monto: 200 }] },
  { estado: "anulada", pagos: [{ metodo: "efectivo", monto: 999 }] },
  { estado: "devuelta", pagos: [{ metodo: "efectivo", monto: 999 }] }
];

const FIXTURE_GASTOS = [
  { medio: "efectivo", importe: 200 },
  { medio: "transferencia", importe: 500 }
];

describe("computeExpected", () => {
  it("applies the single deterministic formula", () => {
    const result = computeExpected({ apertura: 1000, ventas: FIXTURE_VENTAS, gastos: FIXTURE_GASTOS, retiros: 100 });
    expect(result.cobradas).toBe(500);
    expect(result.gastos).toBe(200);
    expect(result.esperado).toBe(1000 + 500 - 200 - 100);
  });

  it("reports net totals grouped by payment method", () => {
    const result = computeExpected({ apertura: 0, ventas: FIXTURE_VENTAS, gastos: [], retiros: 0 });
    expect(result.porMetodo).toEqual([
      { metodo: "efectivo", total: 500 },
      { metodo: "tarjeta", total: 200 }
    ]);
  });
});

describe("closeCashSession", () => {
  it("audits a surplus difference", () => {
    const close = closeCashSession({ apertura: 1000, ventas: FIXTURE_VENTAS, gastos: FIXTURE_GASTOS, retiros: 100, contado: 1250 });
    expect(close.esperado).toBe(1200);
    expect(close.diferencia).toBe(50);
    expect(close.resultado).toBe(CASH_CLOSE_RESULT.SOBRANTE);
  });

  it("audits a shortage difference", () => {
    const close = closeCashSession({ apertura: 1000, ventas: FIXTURE_VENTAS, gastos: FIXTURE_GASTOS, retiros: 100, contado: 1100 });
    expect(close.diferencia).toBe(-100);
    expect(close.resultado).toBe(CASH_CLOSE_RESULT.FALTANTE);
  });
});
