/**
 * Read-only report query handlers (gap-slice G2).
 *
 * Thin compositions over the reports read port only: handlers never touch
 * `UnitOfWork.run` and never remap errors — failures bubble so the edge
 * `toAppError` propagates the catalog code + status. The only policy owned
 * here is the top-products limit clamp (default 20, max 100), mirroring the
 * legacy `reportsService.resolveLimit`; range defaults stay with the adapter
 * at cutover, like the other query handlers. Framework-free: zero
 * `express`/`pg`/`zod` imports.
 */

export const DEFAULT_TOP_LIMIT = 20;
export const MAX_TOP_LIMIT = 100;

export interface ReportsRange {
  readonly from?: string;
  readonly to?: string;
}

export interface TopProductsQuery extends ReportsRange {
  readonly limit?: number;
}

/** Driven port; the infrastructure adapter owns SQL at cutover. */
export interface ReportsReader {
  salesSummary(range: ReportsRange): Promise<unknown>;
  stockValuation(): Promise<unknown>;
  cashSummary(range: ReportsRange): Promise<unknown>;
  topProducts(query: TopProductsQuery): Promise<unknown>;
  repairsByStatus(): Promise<unknown>;
}

function clampTopLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_TOP_LIMIT;
  return Math.min(MAX_TOP_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function makeReportHandlers(reader: ReportsReader) {
  return {
    salesSummary: (range: ReportsRange): Promise<unknown> => reader.salesSummary(range),
    stockValuation: (): Promise<unknown> => reader.stockValuation(),
    cashSummary: (range: ReportsRange): Promise<unknown> => reader.cashSummary(range),
    topProducts: (query: TopProductsQuery): Promise<unknown> =>
      reader.topProducts({ ...query, limit: clampTopLimit(query.limit) }),
    repairsByStatus: (): Promise<unknown> => reader.repairsByStatus()
  };
}
