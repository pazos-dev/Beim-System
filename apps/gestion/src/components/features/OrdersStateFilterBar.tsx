"use client";

import { ORDER_STATE_FILTERS, type OrderStateFilterKey } from "../../lib/domain/orders/orden";
import { cn } from "../../lib/cn";

export interface OrdersStateFilterBarProps {
  readonly activeFilter: OrderStateFilterKey;
  readonly counts: Readonly<Record<OrderStateFilterKey, number>>;
  readonly onChange: (filter: OrderStateFilterKey) => void;
}

export function OrdersStateFilterBar({ activeFilter, counts, onChange }: OrdersStateFilterBarProps) {
  return (
    <div
      aria-label="Filtrar órdenes por estado"
      className="flex flex-wrap gap-2"
      role="group"
    >
      {ORDER_STATE_FILTERS.map((filter) => {
        const active = filter.key === activeFilter;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              active
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-ink hover:bg-surface-muted"
            )}
            key={filter.key}
            onClick={() => onChange(filter.key)}
            type="button"
          >
            {filter.label}
            <span
              aria-label={`${counts[filter.key]} órdenes`}
              className={cn(
                "rounded-full px-1.5 text-xs tabular-nums",
                active ? "bg-white/20 text-white" : "bg-surface-muted text-ink-muted"
              )}
            >
              {counts[filter.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}