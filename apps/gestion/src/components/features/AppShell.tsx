"use client";

import { useState, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { ToastProvider } from "../ui/Toast";
import { GlobalSearch } from "./GlobalSearch";
import { PeriodFilter, type Period } from "./PeriodFilter";
import { Sidebar } from "./Sidebar";

export interface AppShellProps {
  readonly children: ReactNode;
}

const DEFAULT_PERIOD: Period = { type: "day", value: "" };

export function AppShell({ children }: AppShellProps) {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-canvas text-ink">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-brand/20 bg-brand/10 px-4 py-2 text-center text-xs font-semibold tracking-wide text-brand-strong">
            Modo desarrollo, no productivo.
          </div>
          <header className="border-b border-line bg-surface px-4 py-4 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <GlobalSearch onSearch={setSearchQuery} />
              <PeriodFilter onChange={setPeriod} value={period} />
            </div>
            <p aria-live="polite" className="sr-only">
              {searchQuery ? `Búsqueda: ${searchQuery}` : ""}
            </p>
          </header>
          <main className={cn("min-w-0 flex-1 px-4 py-8 lg:px-8")} id="main-content">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
