export interface ReportSaleLike {
  estado: string;
  total: number;
}

export interface ReportExpenseLike {
  fecha: string;
  importe: number;
  categoria?: string;
}

export interface ReportPurchaseLike {
  fecha: string;
  total: number;
}

export interface CategoryTotal {
  categoria: string;
  total: number;
}

export interface PeriodTotals {
  netas: number;
  cantidad: number;
  devoluciones: number;
}

export interface PurchaseTotals {
  total: number;
  cantidad: number;
}

export interface ExpenseTotals {
  total: number;
  porCategoria: CategoryTotal[];
}

export interface PeriodSnapshot {
  desde: string;
  hasta: string;
  ventas: PeriodTotals;
  compras: PurchaseTotals;
  gastos: ExpenseTotals;
  neto: number;
}

export interface PeriodSnapshotInput {
  desde: string;
  hasta: string;
  ventas: ReadonlyArray<ReportSaleLike>;
  compras: ReadonlyArray<ReportPurchaseLike>;
  gastos: ReadonlyArray<ReportExpenseLike>;
}

const UNCATEGORIZED = "general";

function inPeriod(fecha: string, desde: string, hasta: string): boolean {
  const day = fecha.slice(0, 10);
  return day >= desde && day <= hasta;
}

// Venta v1 carries no timestamp, so confirmed sales count in the queried
// period; dated collections (gastos, compras) filter by fecha instead.
export function buildPeriodSnapshot(input: PeriodSnapshotInput): PeriodSnapshot {
  const confirmadas = input.ventas.filter((venta) => venta.estado === "confirmada");
  const devueltas = input.ventas.filter((venta) => venta.estado === "devuelta");
  const ventasNetas = confirmadas.reduce((sum, venta) => sum + venta.total, 0);
  const devoluciones = devueltas.reduce((sum, venta) => sum + venta.total, 0);
  const periodGastos = input.gastos.filter((gasto) => inPeriod(gasto.fecha, input.desde, input.hasta));
  const byCategoria = new Map<string, number>();
  for (const gasto of periodGastos) {
    const categoria = gasto.categoria ?? UNCATEGORIZED;
    byCategoria.set(categoria, (byCategoria.get(categoria) ?? 0) + gasto.importe);
  }
  const gastosTotal = periodGastos.reduce((sum, gasto) => sum + gasto.importe, 0);
  const periodCompras = input.compras.filter((compra) => inPeriod(compra.fecha, input.desde, input.hasta));
  const comprasTotal = periodCompras.reduce((sum, compra) => sum + compra.total, 0);
  const netas = ventasNetas - devoluciones;
  return {
    desde: input.desde,
    hasta: input.hasta,
    ventas: { netas, cantidad: confirmadas.length, devoluciones },
    compras: { total: comprasTotal, cantidad: periodCompras.length },
    gastos: {
      total: gastosTotal,
      porCategoria: [...byCategoria.entries()]
        .map(([categoria, total]) => ({ categoria, total }))
        .sort((left, right) => left.categoria.localeCompare(right.categoria))
    },
    neto: netas - gastosTotal
  };
}

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

// The visible snapshot and the CSV come from this same function: no second formula.
export function snapshotToCsv(snapshot: PeriodSnapshot): string {
  const lines: Array<Array<string | number>> = [
    ["periodo_desde", snapshot.desde],
    ["periodo_hasta", snapshot.hasta],
    ["ventas_netas", snapshot.ventas.netas],
    ["ventas_cantidad", snapshot.ventas.cantidad],
    ["ventas_devoluciones", snapshot.ventas.devoluciones],
    ["compras_total", snapshot.compras.total],
    ["compras_cantidad", snapshot.compras.cantidad],
    ["gastos_total", snapshot.gastos.total],
    ["neto", snapshot.neto],
    [],
    ["gasto_categoria", "total"],
    ...snapshot.gastos.porCategoria.map((row): Array<string | number> => [row.categoria, row.total])
  ];
  return `\ufeff${lines.map((line) => line.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
