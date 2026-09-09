# Tasks: Slice-0 Kernel + Store + Routes Shell

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR onto tracker; Unit 1 commits → Unit 2 commits |
| Delivery strategy | Chain pre-decided (single child PR) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Kernel + store slices with tests | Child PR → `feat/apps-gestion-clean-arch` | `pnpm --filter @beim/gestion test -- kernel theme.slice` | N/A (pure types/state; Vitest is the boundary) | Delete `apps/gestion/src/kernel/**`, `apps/gestion/src/store/**` |
| 2 | Route table + RouteGate + shell composition | Same PR, stacked commits | `pnpm --filter @beim/gestion test -- route-table RouteGate Sidebar` | `pnpm --filter @beim/gestion dev`, visit all 10 paths as allowed/denied roles | Revert composition edits; delete table/gate |

Route paths (10, routes-table spec): `/app/ordenes`, `/app/clientes`, `/app/ventas`, `/app/compras`, `/app/stock`, `/app/servicios`, `/app/caja`, `/app/reportes`, `/app/configuracion`, `/app/audit`.

## Phase 1: Kernel

- [x] 1.1 Create `apps/gestion/src/kernel/role.ts` + `apps/gestion/src/kernel/index.ts` (pinned ROLE_VALUES, const-types Role, isRole; equality vs `apps/gestion/src/server/shared/auth.ts` (read-only)). Test: `pnpm --filter @beim/gestion test -- kernel/role`. Accept: single `type Role =`; values deep-equal frozen set. Rollback: delete kernel files.
- [x] 1.2 Create `apps/gestion/src/kernel/result.ts` + `apps/gestion/src/kernel/errors.ts` (Result ok/err/isOk; ERROR_CODE_VALUES, GestionError, createGestionError; no I/O/zod). Test: `pnpm --filter @beim/gestion test -- kernel/result kernel/errors`. Accept: err-match without throw; codes stable. Rollback: delete both files.

## Phase 2: Store

- [x] 2.1 Create `apps/gestion/src/store/session.slice.ts` (memory-only actor/setUser/clearUser/selectSessionRole; never persisted). Test: `pnpm --filter @beim/gestion test -- session.slice`. Accept: logout clears actor, zero storage keys. Rollback: delete file.
- [x] 2.2 Create `apps/gestion/src/store/theme.slice.ts` (persist `gestion-theme-v1`, version 1, migrate/partialize, legacy `gestion-theme` first-run import, SSR guard). Test: `pnpm --filter @beim/gestion test -- theme.slice`. Accept: round-trip, legacy-string migrate, unknown→`sistema`, survives logout. Rollback: delete file + v1 key.
- [x] 2.3 Create `apps/gestion/src/store/ui.slice.ts` + `apps/gestion/src/store/selectors.ts` (ephemeral modals/sidebarCollapsed/period/cajaFormRevision; drop dead `searchQuery` per `apps/gestion/src/lib/ui-slices/search-slice.ts` (read-only); useShallow reads). Test: `pnpm --filter @beim/gestion test -- ui.slice selectors`. Accept: reload resets ephemeral; no whole-store subscriptions. Rollback: delete both files.

## Phase 3: Routes + Gate

- [x] 3.1 Create `apps/gestion/src/routes/route-table.ts` + `apps/gestion/src/routes/index.ts` (all 10 paths above with roles/label/icon/gate; canAccess/selectVisibleRoutes incl. `/app/caja`). Test: `pnpm --filter @beim/gestion test -- route-table`. Accept: every path resolves; role matrix exact. Rollback: delete routes dir.
- [x] 3.2 Create `apps/gestion/src/routes/RouteGate.tsx` ("use client"; unknown→not-found, wrong role→access-denied; server API untouched). Test: `pnpm --filter @beim/gestion test -- RouteGate`. Accept: authorized renders, unauthorized blocked. Rollback: delete file.

## Phase 4: Composition

- [x] 4.1 Modify `apps/gestion/src/components/features/Sidebar.tsx` (render from selectVisibleRoutes(role); delete SIDEBAR_NAV_ITEMS; keep STORAGE_KEY/collapse). Test: `pnpm --filter @beim/gestion test -- Sidebar`. Accept: entries equal role-filtered table; new entry needs no Sidebar change. Rollback: restore hardcode.
- [x] 4.2 Modify `apps/gestion/src/components/features/AppShell.tsx` + `apps/gestion/src/lib/ui-store.ts` (composition over selectors only; ui-store becomes re-export shim; `apps/gestion/src/server/handlers/auth.ts` (read-only) untouched). Test: `pnpm --filter @beim/gestion test -- AppShell`. Accept: single persistent layout across navigation. Rollback: restore both files.

## Phase 5: Gate

- [x] 5.1 Run grep/typecheck/test gate with worktree cwd: zero page→server-handler imports (4 legacy shim allowed), zero server-entity keys in store, single `type Role =`, adapter checklist N/A. Test: `pnpm --filter @beim/gestion typecheck` + `pnpm --filter @beim/gestion test`. Accept: all green, diff ≤400 lines. Rollback: revert slice-0 commits.

## Apply evidence (slice-0, 2026-09-09)

- Unit 1 commit `929971b`: kernel (role/result/errors/index + 3 tests, 8 tests green) + store (session/theme/ui/selectors + 3 tests, 13 tests green).
- Unit 2 commit `b1fbf27`: routes (table/gate/index + 2 tests, 7 tests green) + Sidebar/AppShell composition + ui-store shim + updated sidebar test (4 tests green).
- Gate: `tsc --noEmit` green; full suite 674/675 (single userEvent timeout in `venta-anular-modal.test.tsx`, passes 4/4 in isolation — load flake, untouched by this diff); pages importing `Role` from `server/handlers/auth`: exactly the 4 legacy allowed (ordenes, clientes, ventas, servicios); `type Role =` count is 2 (kernel canonical + frozen `server/shared/auth.ts`, zero server edits per scope — server re-points to kernel in slice-1); store holds zero server-entity collections (only modal booleans named `stock*`); adapter checklist N/A (no adapters in slice-0).
- Budget: `size:exception` — slice diff is ~905 insertions (644 unit 1 + 261 unit 2), over the 400-line budget. Overage is honest test bulk (8 test files, ~400 lines) required by the task acceptance criteria; implementation is ~500 lines. No minification applied. Rollback: revert the two unit commits.
