"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "../../lib/cn";
import { selectSessionRole, useSessionStore } from "../../store/session.slice";
import { selectSidebarCollapsed } from "../../store/selectors";
import { useUiSliceStore } from "../../store/ui.slice";
import { selectVisibleRoutes } from "../../routes/route-table";

export const SIDEBAR_STORAGE_KEY = "gestion-sidebar-collapsed";
export const SIDEBAR_ICON_SIZE = 20;

function isActivePath(currentPath: string, href: string): boolean {
  return href === "/app" ? currentPath === href : currentPath === href || currentPath.startsWith(`${href}/`);
}

// Thin composition: menu entries come exclusively from the route table,
// filtered by the session role. Adding a table entry adds a sidebar item
// with no change here.
export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useUiSliceStore(selectSidebarCollapsed);
  const setCollapsed = useUiSliceStore((state) => state.setSidebarCollapsed);
  const role = useSessionStore(selectSessionRole);
  const entries = selectVisibleRoutes(role);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    } catch {
      setCollapsed(false);
    }
  }, [setCollapsed]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // A storage failure must not block navigation; this is only a UI preference.
    }
    setCollapsed(next);
  };

  return (
    <aside
      className={cn(
        "flex min-h-screen flex-col border-r border-line bg-surface transition-[width] duration-200",
        collapsed ? "w-20" : "w-64"
      )}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="flex min-h-16 items-center justify-between gap-3 border-b border-line px-4">
        <span className={cn("font-semibold tracking-tight text-ink", collapsed && "sr-only")}>Beim Gestión</span>
        <button
          aria-controls="gestion-sidebar-nav"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          className="inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
          onClick={toggleCollapsed}
          type="button"
        >
          <span aria-hidden="true">{collapsed ? "→" : "←"}</span>
        </button>
      </div>
      <nav aria-label="Navegación principal" className="flex-1 px-3 py-4">
        <ul className="flex flex-col gap-1" id="gestion-sidebar-nav">
          {entries.map((item) => {
            const active = isActivePath(pathname, item.path);
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "group relative flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    active ? "bg-brand/10 text-brand-strong" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                    collapsed && "justify-center px-2"
                  )}
                  href={item.path}
                >
                  <Icon aria-hidden="true" className="shrink-0" size={SIDEBAR_ICON_SIZE} />
                  <span className={collapsed ? "sr-only" : "ml-3"}>{item.label}</span>
                  {collapsed ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-full z-10 ml-2 hidden rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium whitespace-nowrap text-ink shadow-shell group-hover:block group-focus-visible:block"
                    >
                      {item.label}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
