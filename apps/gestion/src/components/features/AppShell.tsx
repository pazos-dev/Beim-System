"use client";

import type { ReactNode } from "react";

import { usePathname, useRouter } from "next/navigation";

import { cn } from "../../lib/cn";
import { useUiStore } from "../../lib/ui-store";
import { ToastProvider } from "../ui/Toast";
import { GlobalSearch } from "./GlobalSearch";
import { PeriodFilter } from "./PeriodFilter";
import { Sidebar } from "./Sidebar";

export interface AppShellProps {
  readonly children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const period = useUiStore((state) => state.period);
  const setPeriod = useUiStore((state) => state.setPeriod);

  // URL is the source of truth for search: the header writes `q` into the
  // current page. List pages consume it from searchParams via useListQuery;
  // pages without `q` support preserve it untouched and ignore it.
  function handleGlobalSearch(query: string): void {
    const params = new URLSearchParams(window.location.search);
    if (query === "") params.delete("q");
    else params.set("q", query);
    const search = params.toString();
    router.replace(search === "" ? pathname : `${pathname}?${search}`);
  }

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
              <GlobalSearch onSearch={handleGlobalSearch} />
              <PeriodFilter onChange={setPeriod} value={period} />
            </div>
          </header>
          <main className={cn("min-w-0 flex-1 px-4 py-8 lg:px-8")} id="main-content">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
