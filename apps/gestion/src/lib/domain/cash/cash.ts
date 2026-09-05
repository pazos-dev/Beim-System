export const CASH_SESSION_STATUS = {
  ABIERTA: "abierta",
  CERRADA: "cerrada"
} as const;

export type CashSessionStatus = (typeof CASH_SESSION_STATUS)[keyof typeof CASH_SESSION_STATUS];

export const CASH_CLOSE_RESULT = {
  SOBRANTE: "sobrante",
  FALTANTE: "faltante",
  EXACTO: "exacto"
} as const;

export type CashCloseResult = (typeof CASH_CLOSE_RESULT)[keyof typeof CASH_CLOSE_RESULT];

export const CASH_METHOD = {
  EFECTIVO: "efectivo"
} as const;

export interface CashPaymentLike {
  metodo: string;
  monto: number;
}

export interface CashSaleLike {
  estado: string;
  pagos: CashPaymentLike[];
}

export interface CashExpenseLike {
  medio: string;
  importe: number;
}

export interface PaymentTotal {
  metodo: string;
  total: number;
}

export interface CashExpectedInput {
  apertura: number;
  ventas: ReadonlyArray<CashSaleLike>;
  gastos: ReadonlyArray<CashExpenseLike>;
  retiros: number;
}

export interface CashExpected {
  esperado: number;
  cobradas: number;
  gastos: number;
  retiros: number;
  porMetodo: PaymentTotal[];
}

export interface CashCloseInput extends CashExpectedInput {
  contado: number;
}

export interface CashClose extends CashExpected {
  contado: number;
  diferencia: number;
  resultado: CashCloseResult;
}

function isConfirmed(sale: CashSaleLike): boolean {
  return sale.estado === "confirmada";
}

function cashCollected(sales: ReadonlyArray<CashSaleLike>): number {
  return sales
    .filter(isConfirmed)
    .flatMap((sale) => sale.pagos)
    .filter((pago) => pago.metodo === CASH_METHOD.EFECTIVO)
    .reduce((sum, pago) => sum + pago.monto, 0);
}

function cashSpent(expenses: ReadonlyArray<CashExpenseLike>): number {
  return expenses
    .filter((gasto) => gasto.medio === CASH_METHOD.EFECTIVO)
    .reduce((sum, gasto) => sum + gasto.importe, 0);
}

function netByMethod(sales: ReadonlyArray<CashSaleLike>): PaymentTotal[] {
  const totals = new Map<string, number>();
  for (const pago of sales.filter(isConfirmed).flatMap((sale) => sale.pagos)) {
    totals.set(pago.metodo, (totals.get(pago.metodo) ?? 0) + pago.monto);
  }
  return [...totals.entries()]
    .map(([metodo, total]) => ({ metodo, total }))
    .sort((left, right) => left.metodo.localeCompare(right.metodo));
}

// Single deterministic formula: opening + cash-collected sales - cash expenses - withdrawals.
export function computeExpected(input: CashExpectedInput): CashExpected {
  const cobradas = cashCollected(input.ventas);
  const gastos = cashSpent(input.gastos);
  return {
    esperado: input.apertura + cobradas - gastos - input.retiros,
    cobradas,
    gastos,
    retiros: input.retiros,
    porMetodo: netByMethod(input.ventas)
  };
}

export function closeCashSession(input: CashCloseInput): CashClose {
  const expected = computeExpected(input);
  const diferencia = input.contado - expected.esperado;
  const resultado: CashCloseResult =
    diferencia > 0 ? CASH_CLOSE_RESULT.SOBRANTE
    : diferencia < 0 ? CASH_CLOSE_RESULT.FALTANTE
    : CASH_CLOSE_RESULT.EXACTO;
  return { ...expected, contado: input.contado, diferencia, resultado };
}
