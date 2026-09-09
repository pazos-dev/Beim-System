# Design: Slice-0 Kernel + Store + Routes Shell

## Technical Approach

Additive foundation only. New `src/kernel/`, `src/store/`, `src/routes/` beside existing `src/lib/ui-store.ts`, `src/server/**`, `features/Sidebar.tsx`. No server edits, no API change, no page-logic change. Sidebar/AppShell become thin compositions over the route table. Old imports keep compiling; pages migrate in slice-1.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Kernel imports `ROLE_VALUES` from `src/server/shared/auth.ts` vs duplicates pinned literal | Import leaks `node:crypto`+`JsonStore` into client bundle; duplicate risks drift | Duplicate pinned literal in `src/kernel/role.ts` with frozen-source comment + Vitest equality test vs `ROLE_VALUES`. No server import. |
| Kernel `Result`/errors import from `src/server/**` vs self-contained | Reuse is DRY but pulls zod/schemas into every client | Self-contained `src/kernel/result.ts` + `src/kernel/errors.ts` (const `ERROR_CODE_VALUES` + `GestionError` interface, no zod, no I/O). Server stays untouched in slice-0; slice-1 re-points server to kernel. |
| Move vs re-export `ui-store.ts` | Move breaks all importers, blows 400-line budget | New `src/store/*` canonical; `src/lib/ui-store.ts` becomes deprecated re-export shim, deleted in a later slice. Same for `src/server/handlers/auth.ts`: untouched in slice-0 (already re-exports shared); slice-1 flips it to kernel. |
| Theme inside session slice vs dedicated persisted slice | Combined slice couples re-renders, leaks session into storage, loses theme on logout | Dedicated `src/store/theme.slice.ts` with `persist(version/migrate/partialize)`, key `gestion-theme-v1`. Session slice memory-only, never persisted with prefs. |
| Route table holds `LucideIcon` component vs string name | String needs a registry + switch; component is direct | Hold `icon: LucideIcon` (`lucide-react` type only, no I/O). Sidebar maps table to `<Link>` unchanged. |

## Data Flow

```
page → RouteGate(entry, actorRole) → AppShell → Sidebar(ROUTES × role)
  │            │                          │
  │     selectSessionRole(session.slice)  selectPrefsTheme(theme.slice)
  │                                        │
  └─ query hooks (server data, slice-1+) ─┘  store: UI + session-actor only
```

Gate is UI-only. Authorization stays server-side (frozen API). `resolveSession`/`AuthService` untouched.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/kernel/role.ts` | Create | Pinned `ROLE_VALUES` (5 values, mirror of frozen `src/server/shared/auth.ts`), `Role` union via const-types pattern, `isRole` guard |
| `src/kernel/result.ts` | Create | `Result<T,E>`, `ok`/`err`, `isOk`; no dependencies |
| `src/kernel/errors.ts` | Create | Pinned `ERROR_CODES`, `ErrorCode`, `GestionError` flat interface, `createGestionError`; no zod |
| `src/kernel/index.ts` | Create | Barrel re-export only |
| `src/store/theme.slice.ts` | Create | `persist` store key `gestion-theme-v1`, `version: 1`, `migrate` from legacy, `partialize` theme-only; `selectPrefsTheme`, `useThemePrefs` |
| `src/store/session.slice.ts` | Create | Memory-only `actor: UserActor(Role)` + `setUser`/`clearUser`; `selectSessionRole` |
| `src/store/ui.slice.ts` | Create | Memory-only ephemeral: modals, `sidebarCollapsed`, `period`, `cajaFormRevision`; no persist; drops dead `searchQuery` |
| `src/store/selectors.ts` | Create | Co-located selectors; `useShallow` for multi-field reads; no whole-store subscriptions |
| `src/routes/route-table.ts` | Create | `ROUTES: readonly RouteEntry[]`, `canAccess`, `selectVisibleRoutes` |
| `src/routes/RouteGate.tsx` | Create | `"use client"` gate: unknown path → not-found; wrong role → access-denied |
| `src/routes/index.ts` | Create | Barrel |
| `src/components/features/Sidebar.tsx` | Modify | Render from `selectVisibleRoutes(role)`; delete `SIDEBAR_NAV_ITEMS` hardcode (keep `SIDEBAR_STORAGE_KEY`, collapse behavior) |
| `src/components/features/AppShell.tsx` | Modify | Composition only: consume selectors, no new layout |
| `src/lib/ui-store.ts` | Modify | Deprecated re-export shim to `src/store/*` (deleted post slice-1) |

## Interfaces / Contracts

```ts
// src/kernel/role.ts — pinned mirror, never edited independently
export const ROLE_VALUES = ["vendedor","tecnico","caja","administrador","administrador_principal"] as const;
export type Role = (typeof ROLE_VALUES)[number];

// src/store/theme.slice.ts — zustand-5 persist, SSR-safe
persist((set) => ({ theme, setTheme }), {
  name: "gestion-theme-v1", version: 1, migrate, partialize: (s) => ({ theme: s.theme }),
});

// src/routes/route-table.ts
interface RouteEntry { path: string; roles: readonly Role[]; label: string; icon: LucideIcon; gate: "role" | "auth"; }
```

Theme migrate: `persistedState` string → `{theme}`; v0 object with raw `theme` → wrap; unknown/absent → `"sistema"`. First-run fallback reads legacy key `gestion-theme` once if v1 absent; legacy key deleted only after v1 persists. Storage failure → default, never throws (SSR guard `typeof window === "undefined"`).

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (Vitest node) | `ROLE_VALUES` deep-equals frozen `src/server/shared/auth.ts`; single `type Role =` grep; `ok`/`err` match, `createGestionError` codes stable | `src/kernel/*.test.ts`, `// @vitest-environment node` not needed (default) |
| Unit (Vitest) | Theme round-trip: set→reload→restore; legacy `gestion-theme` string migrates; unknown→`sistema`; logout clears actor, theme survives; ephemeral resets | `src/store/*.test.ts` with `vi.stubGlobal("window",…)` pattern from existing `settings-slice.test.ts`; `vi.resetModules` fresh store |
| Unit (jsdom) | `canAccess`/`selectVisibleRoutes` matrix incl. `/app/caja`; Sidebar renders exactly role-filtered entries; unknown path → not-found | `src/routes/*.test.tsx` + Sidebar test, `// @vitest-environment jsdom` |
| Grep checklist | Zero page→`server/handlers` new imports (4 legacy allowed via shim); zero server-entity keys in `src/store/`; adapter checklist recorded N/A | `pnpm typecheck && pnpm test` green in `apps/gestion` |

## Threat Matrix

N/A — no routing-infra, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. `src/routes/` is in-app navigation data; enforcement is UI-only, server API frozen.

## Migration / Rollout

Additive, no migration. Rollout: merge slice-0 branch (≤400 lines) via chained PR onto tracker. Rollback: revert slice-0 commits; `src/server/handlers/auth.ts` shim untouched so the 4 legacy `Role` imports (`ordenes, clientes, ventas, servicios`) keep compiling; delete `src/kernel|store|routes` restores baseline. Slice-1 removes shims: pages → `src/kernel/`, server → kernel, delete `src/lib/ui-store.ts` shim.

## Open Questions

- None blocking. Slice-1 owns per-route role matrix values and `caja` set reconciliation.
