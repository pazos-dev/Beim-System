import { describe, expect, it } from "vitest";

import { buildPeriodSnapshot, snapshotToCsv } from "./reports.js";

const FIXTURE_VENTAS = [
  { estado: "confirmada", total: 1000 },
  { estado: "anulada", total: 500 },
  { estado: "devuelta", total: 200 }
];

const FIXTURE_COMPRAS = [{ fecha: "2026-01-10T12:00:00.000Z", total: 400 }];

const FIXTURE_GASTOS = [
  { fecha: "2026-01-05T12:00:00.000Z", importe: 100, categoria: "operativo" },
  { fecha: "2026-01-20T12:00:00.000Z", importe: 200, categoria: "operativo" },
  { fecha: "2026-02-01T12:00:00.000Z", importe: 999, categoria: "operativo" }
];

function csvValue(csv: string, key: string): number {
  const line = csv
    .replace(/^\ufeff/, "")
    .split("\n")
    .map((row) => row.replace(/\r$/, "").replace(/"/g, ""))
    .find((row) => row.startsWith(`${key};`));
  if (line === undefined) throw new Error(`Missing CSV key: ${key}`);
  return Number(line.split(";")[1]);
}

describe("buildPeriodSnapshot", () => {
  it("excludes annulled sales, subtracts returned sales and keeps purchases out of expenses", () => {
    const snapshot = buildPeriodSnapshot({ desde: "2026-01-01", hasta: "2026-01-31", ventas: FIXTURE_VENTAS, compras: FIXTURE_COMPRAS, gastos: FIXTURE_GASTOS });
    expect(snapshot.ventas.netas).toBe(800);
    expect(snapshot.ventas.devoluciones).toBe(200);
    expect(snapshot.compras.total).toBe(400);
    expect(snapshot.gastos.total).toBe(300);
    expect(snapshot.neto).toBe(500);
  });

  it("returns zeros for an empty period instead of failing", () => {
    const snapshot = buildPeriodSnapshot({ desde: "2026-03-01", hasta: "2026-03-31", ventas: [], compras: [], gastos: [] });
    expect(snapshot.ventas.netas).toBe(0);
    expect(snapshot.compras.total).toBe(0);
    expect(snapshot.gastos.total).toBe(0);
    expect(snapshot.neto).toBe(0);
  });
});

describe("snapshotToCsv", () => {
  it("serializes the same snapshot without a second formula", () => {
    const snapshot = buildPeriodSnapshot({ desde: "2026-01-01", hasta: "2026-01-31", ventas: FIXTURE_VENTAS, compras: FIXTURE_COMPRAS, gastos: FIXTURE_GASTOS });
    const csv = snapshotToCsv(snapshot);
    expect(csvValue(csv, "ventas_netas")).toBe(snapshot.ventas.netas);
    expect(csvValue(csv, "compras_total")).toBe(snapshot.compras.total);
    expect(csvValue(csv, "gastos_total")).toBe(snapshot.gastos.total);
    expect(csvValue(csv, "neto")).toBe(snapshot.neto);
  });
});
