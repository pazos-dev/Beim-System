// Maps the header PeriodFilter value to an inclusive [desde, hasta] range
// (YYYY-MM-DD) used as the default range of the reportes and audit pages.
// Invalid or empty values fall back to the current month so the pages always
// fetch a meaningful default; users can still override via the inputs.

import type { Period } from "../components/features/PeriodFilter";

export interface DateRange {
  readonly desde: string;
  readonly hasta: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function currentMonthRange(today: Date): DateRange {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, today.getUTCMonth() + 1, 0)).getUTCDate();
  return { desde: formatDay(year, month, 1), hasta: formatDay(year, month, lastDay) };
}

export function periodToRange(period: Period, today: Date = new Date()): DateRange {
  if (period.type === "day" && /^\d{4}-\d{2}-\d{2}$/.test(period.value)) {
    return { desde: period.value, hasta: period.value };
  }
  if (period.type === "month") {
    const match = /^(\d{4})-(\d{2})$/.exec(period.value);
    if (match !== null) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month >= 1 && month <= 12) {
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return { desde: formatDay(year, month, 1), hasta: formatDay(year, month, lastDay) };
      }
    }
    return currentMonthRange(today);
  }
  if (period.type === "year" && /^\d{4}$/.test(period.value)) {
    return { desde: `${period.value}-01-01`, hasta: `${period.value}-12-31` };
  }
  return currentMonthRange(today);
}
