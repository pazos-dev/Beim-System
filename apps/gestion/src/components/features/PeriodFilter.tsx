import { Button } from "../ui/Button";

export type PeriodType = "day" | "month" | "year";

export interface Period {
  readonly type: PeriodType;
  readonly value: string;
}

export interface PeriodFilterProps {
  readonly value: Period;
  readonly onChange: (period: Period) => void;
  readonly id?: string;
}

const PERIOD_OPTIONS: readonly { label: string; type: PeriodType }[] = [
  { label: "Día", type: "day" },
  { label: "Mes", type: "month" },
  { label: "Año", type: "year" }
];

function convertValue(value: string, nextType: PeriodType): string {
  if (nextType === "day") {
    if (/^\d{4}$/.test(value)) {
      return `${value}-01-01`;
    }
    if (/^\d{4}-\d{2}$/.test(value)) {
      return `${value}-01`;
    }
    return value;
  }
  if (nextType === "month") {
    if (/^\d{4}$/.test(value)) {
      return `${value}-01`;
    }
    return value.slice(0, 7);
  }
  return value.slice(0, 4);
}

function inputTypeFor(periodType: PeriodType): "date" | "month" | "number" {
  if (periodType === "day") {
    return "date";
  }
  if (periodType === "month") {
    return "month";
  }
  return "number";
}

export function PeriodFilter({ id = "period-filter-value", onChange, value }: PeriodFilterProps) {
  return (
    <fieldset className="flex flex-wrap items-end gap-2 border-0 p-0">
      <legend className="sr-only">Período</legend>
      <div aria-label="Período" className="flex rounded-md border border-line bg-surface p-1" role="group">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            aria-pressed={value.type === option.type}
            key={option.type}
            onClick={() => onChange({ type: option.type, value: convertValue(value.value, option.type) })}
            variant={value.type === option.type ? "primary" : "ghost"}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-ink-muted" htmlFor={id}>
          Valor del período
        </label>
        <input
          className="min-h-10 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          id={id}
          min={value.type === "year" ? "2000" : undefined}
          onChange={(event) => onChange({ type: value.type, value: event.target.value })}
          type={inputTypeFor(value.type)}
          value={value.value}
        />
      </div>
    </fieldset>
  );
}
