# Proposal: apps-gestion Clean/Hexagonal Migration

## Intent

`apps/gestion` has no port boundary: `Role` imported from server handlers in 4 pages, session mirrored in Zustand + React Query, `lib/domain/*` embryonic. Migrate to Clean/Hexagonal so UI depends on ports/use-cases, persistence behind repository ports. EXCEPTION: may touch `src/server/composition/*` — sole sanctioned frozen-API breach.

## Scope

### In Scope
- Kernel `src/kernel/` + store `src/store/` + routes `src/routes/` + AppShell/Sidebar single layout
- Per-domain slices: kernel types → port → JsonStore-behind-port → use-case → controller → query-specific hook
- `Role` → kernel; versioned prefs; one-line adapter swap rule

### Out of Scope
- Persistence swap (Drizzle/Postgres) — future; ports make it drop-in
- Boleta iframe, reportes CSV export; `pagina-web/`, `sistema-gestion/`; sibling changes untouched

## Capabilities

### New Capabilities
- `clean-arch-kernel`: kernel types/errors/result + canonical `Role`
- `client-store-layer`: `src/store/` ownership/selector conventions
- `route-table`: `src/routes/` path+roles+menu+gating; AppShell/Sidebar single layout

### Modified Capabilities
- None (structural migration; observable behavior unchanged)

## Approach

Kernel+store+routes-shell first (unblocks all), then domain-by-domain over the `composition/*` seam. JsonStore stays behind each port — behavior identical.

## Layer Map

kernel → ports → use-cases (no I/O) → controllers (zod, error map) → hooks/adapters (React Query; only server mirrors) → store (UI + session-actor only) → ui/pages. Inward only; pages never import server internals.

## Query Hooks (one per query, no mega-hook)

Each hook owns its key factory, parse, invalidation:

| Hook | Query | Key |
|------|-------|-----|
| `useBootstrap` | app bootstrap/config | `['bootstrap']` |
| `useClientList` | clientes list | `['clientes','list',params]` |
| `useProductList` | productos list | `['productos','list',params]` |
| `useOrders` / `useOrderDetail` / `useCreateOrder` | ordenes list/detail/create | `['ordenes',…]` |
| `useVentas` | ventas list | `['ventas','list',params]` |
| `useCompras` | compras list | `['compras','list',params]` |
| `useStockLevels` / `useStockMovements` | stock levels/movements | `['stock',…]` |
| `useServicios` | servicios list | `['servicios','list',params]` |
| `useCajaEstado` | caja estado | `['caja','estado']` |
| `useReportesSnapshot` | reportes snapshot | `['reportes','snapshot',params]` |

## Theme Store Decision

Dedicated versioned slice `src/store/theme.slice.ts`, persist key `gestion-theme-v1` (`version`/`migrate`/`partialize`) — NOT inside the user/session slice. Rationale: session actor changes identity; prefs must survive logout; mixing couples re-renders + leaks session data into persisted storage. Rule: prefs slices never import session; session slice never persisted with prefs.

## Adapter Swap Rule

Every request passes through a `<Domain>RepositoryPort`. The ONLY backend-choosing line is the composition binding per domain (`src/server/composition/<domain>.composition.ts`): `const repo: ClienteRepositoryPort = new JsonClienteRepository()` → later `new HttpClienteRepository()`. Checklist per slice: grep proves zero `JsonStore`/fetch imports outside `src/server/adapters/` + `composition/`.

## Routes + Layout

`src/routes/` owns the route table (`{ path, roles, label, icon, gate }`); AppShell/Sidebar is THE layout composition (single layout, sidebar persistent). Pages declare; routes enforce.

## Domain Slices

| # | Slice | Contents | Rollback boundary |
|---|-------|----------|-------------------|
| 0 | kernel+store+routes-shell | `kernel/`, `src/store/`, `src/routes/`, `Role` move, theme slice | Revert slice-0 commits; old imports kept via shim |
| 1 | auth | bootstrap hook, session slice, route gating | Re-point composition to old handlers |
| 2–9 | ordenes, clientes, ventas, compras, stock, servicios, caja, reportes | port→adapter→use-case→controller→hook | Per-domain: re-point composition binding |

Each slice: ≤400 lines, own branch + issue, merges only via chain. Per-slice briefs: `sessions/slice-N-<domain>.md` (disjoint file lists; shared contracts by name+version).

## Store-Layer Rules

- `src/store/`: UI + session-actor client state ONLY; never server mirrors.
- Prefs versioned persist; ephemeral (toasts/modals/in-progress filters) memory-only.
- One owner per key; cross-slice reads via co-located selectors (`selectSessionRole`, `selectPrefs…`); no whole-store subscriptions; `searchQuery` dead key removed.

## Agent Skill Matrix

Default EVERY slice: `solid` + `api-design-principles` + `error-handling-patterns`.

| Slice | Extras (exact paths) |
|-------|----------------------|
| 0 kernel/store/routes | `typescript`, `zustand-5` (~/.config/opencode/skills/), `nextjs-15`, `react-19` |
| 1 auth | `nextjs-15`, `react-19`, `frontend-design` (.agents/skills/) |
| 2–8 domains | `zod-4`, `tanstack-query-best-practices` (.agents/skills/), `vercel-composition-patterns` (.agents/skills/) |
| 9 reportes | zod-4 + tanstack as above, `tailwind-4` |
| All PRs | `chained-pr`, `work-unit-commits` (~/.config/opencode/skills/) |
| Debugging | `systematic-debugging` (.agents/skills/) |

## Branch + Issues Plan

Parent `feat/apps-gestion-clean-arch` off Slice-2 tip; children `feat/apps-gestion-clean-arch/slice-N-<domain>`; draft tracker PR, no-merge. One issue per slice (0–9); each child PR ≤400 lines, ≤60-min review.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Rebase drift vs Slice-1/2 tips | Med | Branch off Slice-2 tip; rebase one slice at a time |
| Frozen-API exception scope | Low | `composition/*` wiring only; called out in every PR |
| `Role` move breaks 4 pages | Med | Slice-0 re-export shim; removed in slice-1 |
| Slice creep (Drizzle sneaks in) | Low | Port frozen per slice; reject non-adapter persistence diffs |

## Rollback Plan

Per-slice: revert child branch, re-point `composition/*` binding to pre-slice wiring. Slice-0 revert restores old `Role` path via shim. Tracker never merges until all children green.

## Dependencies

Slice-2 tip as base; `composition/*` seam + `lib/domain/*` embryos as starting points.

## Success Criteria

- [ ] Pages import `Role`/types from kernel only; zero page→server-handler imports
- [ ] Store holds no server mirrors; theme versioned, ephemeral memory-only
- [ ] Each domain behind port; one-line swap rule holds (grep checklist green)
- [ ] One hook per query with owned keys; routes enforce gating via table
- [ ] Every slice ≤400 lines, own issue + chained PR, CI green
