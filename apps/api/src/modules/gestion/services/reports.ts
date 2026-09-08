/**
 * Reports service (issue #164) — thin read-only layer over pg-reports.
 *
 * Owns the range policy shared by the ranged reports: `to` defaults to the
 * local today, `from` defaults to 29 days before `to` (last 30 days), `from`
 * must not be after `to`, and ranges longer than 366 days are rejected —
 * both violations are 422 ValidationError. Daily series always come from SQL
 * generate_series (zero-filled days included); status counts are zero-filled
 * here so new states never break the contract.
 */
import { ValidationError } from "../../../errors/taxonomy.js";
import { reportsRepository } from "../repositories/pg-reports.js";
import { REPAIR_STATUSES } from "./receipts.js";

const MAX_RANGE_DAYS = 366;
const DEFAULT_TOP_LIMIT = 20;
const MAX_TOP_LIMIT = 100;

/** Local calendar date (YYYY-MM-DD), same convention as the sales journal. */
function localToday(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Parses a YYYY-MM-DD date as a local-midnight Date (never UTC-shifted). */
function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month as number) - 1, day);
}

function formatLocalDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export interface ReportsRangeInput {
  from?: string;
  to?: string;
}

function resolveRange(input: ReportsRangeInput): { from: string; to: string } {
  const to = input.to ?? localToday();
  const toDate = parseLocalDate(to);
  const defaultFrom = new Date(toDate);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const from = input.from ?? formatLocalDate(defaultFrom);

  if (from > to) {
    throw new ValidationError("El rango de fechas es inválido: from no puede ser posterior a to", {
      field: "from",
      from,
      to
    });
  }
  const days = Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new ValidationError("El rango de fechas supera el máximo de 366 días", {
      field: "to",
      from,
      to
    });
  }
  return { from, to };
}

function resolveLimit(limit?: number): number {
  if (limit === undefined) return DEFAULT_TOP_LIMIT;
  return Math.min(MAX_TOP_LIMIT, Math.max(1, Math.trunc(limit)));
}

export const reportsService = {
  async salesSummary(input: ReportsRangeInput = {}) {
    const range = resolveRange(input);
    const [totals, byDay, byMethod] = await Promise.all([
      reportsRepository.salesTotals(range),
      reportsRepository.salesByDay(range),
      reportsRepository.salesByMethod(range)
    ]);
    return {
      ...range,
      totalSales: totals.total,
      ticketCount: totals.ticketCount,
      averageTicket: totals.ticketCount === 0 ? 0 : totals.total / totals.ticketCount,
      byDay,
      byMethod
    };
  },

  async stockValuation() {
    const { items, totalValuation } = await reportsRepository.stockValuation();
    return {
      items,
      totalValuation,
      productCount: items.length,
      lowStockCount: items.filter((item) => item.lowStock).length
    };
  },

  async cashSummary(input: ReportsRangeInput = {}) {
    const range = resolveRange(input);
    const [nets, sessions] = await Promise.all([
      reportsRepository.cashMovementNets(range),
      reportsRepository.closedCashSessions(range)
    ]);
    const byType = new Map(nets.map((net) => [net.type, net.total]));
    const ingreso = byType.get("ingreso") ?? 0;
    const egreso = byType.get("egreso") ?? 0;
    const ajuste = byType.get("ajuste") ?? 0;
    return {
      ...range,
      movements: nets,
      net: ingreso - egreso + ajuste,
      sessions,
      closedCount: sessions.length,
      totalDifference: sessions.reduce((sum, session) => sum + session.difference, 0)
    };
  },

  async topProducts(input: ReportsRangeInput & { limit?: number } = {}) {
    const range = resolveRange(input);
    const limit = resolveLimit(input.limit);
    const [byQuantity, byRevenue] = await Promise.all([
      reportsRepository.topByQuantity(range, limit),
      reportsRepository.topByRevenue(range, limit)
    ]);
    return { ...range, limit, byQuantity, byRevenue };
  },

  async repairsByStatus() {
    const rows = await reportsRepository.repairsCountByStatus();
    const counts = Object.fromEntries(REPAIR_STATUSES.map((status) => [status, 0])) as Record<string, number>;
    for (const row of rows) {
      counts[row.status] = (counts[row.status] ?? 0) + row.count;
    }
    return { counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) };
  }
};
