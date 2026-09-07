"use client";

import { Suspense, useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { AdminBackupsPanel, AdminMenuPanel, AdminMigrationPanel, AdminRolesPanel } from "../../../src/components/features/AdminHub";

const ADMIN_ROLES: ReadonlySet<string> = new Set(["administrador", "administrador_principal"]);

const COPY = {
  denied: "Your session is not authorized for the admin hub.",
  error: "Could not verify the admin session. Retry.",
  loading: "Loading admin hub…",
  login: "Go to login",
  title: "Administration"
} as const;

const TABS = ["menu", "roles", "backups", "migration"] as const;

type AdminTab = (typeof TABS)[number];

const TAB_LABELS: Record<AdminTab, string> = {
  backups: "Backups",
  menu: "Menu",
  migration: "Migration",
  roles: "Roles"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTab(value: string | null): AdminTab {
  return value === "roles" || value === "backups" || value === "migration" ? value : "menu";
}

function AdminPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/gestion/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!active) return;
        if (response.ok && isRecord(payload) && isRecord(payload.data) && typeof payload.data.role === "string") {
          setAllowed(ADMIN_ROLES.has(payload.data.role));
        } else {
          setAllowed(false);
        }
      })
      .catch(() => {
        if (active) setAllowed(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function selectTab(next: AdminTab): void {
    router.replace(next === "menu" ? "/app/admin" : `/app/admin?tab=${next}`);
  }

  return (
    <section aria-labelledby="admin-title" className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Module</p>
      <h1 className="text-3xl font-semibold tracking-tight text-ink" id="admin-title">
        {COPY.title}
      </h1>

      {allowed === null ? (
        <p>{COPY.loading}</p>
      ) : !allowed ? (
        <p role="alert">
          {COPY.denied} <a href="/login">{COPY.login}</a>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Admin sections">
            {TABS.map((entry) => (
              <button
                aria-selected={tab === entry}
                key={entry}
                onClick={() => selectTab(entry)}
                role="tab"
                type="button"
                className={tab === entry ? "rounded-md border border-brand px-3 py-2 font-semibold" : "rounded-md border border-line px-3 py-2"}
              >
                {TAB_LABELS[entry]}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "menu" ? <AdminMenuPanel /> : null}
            {tab === "roles" ? <AdminRolesPanel /> : null}
            {tab === "backups" ? <AdminBackupsPanel /> : null}
            {tab === "migration" ? <AdminMigrationPanel /> : null}
          </div>
        </>
      )}
    </section>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p>{COPY.loading}</p>}>
      <AdminPageContent />
    </Suspense>
  );
}
