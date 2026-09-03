# Proposal: Desktop App (Electron + React)

## Intent

Native desktop experience for the BEIM management panel (boleta, cash, stock, orders). **NEW capability — no legacy desktop** (legacy is web-only). Goal: installable Electron app consuming the SAME `@beim/data` backend as web/gestion (shared monorepo), with a bounded MVP avoiding whole-admin duplication. Confirmed decision: **Electron + React**.

## Scope

### In Scope (MVP)
- New `apps/desktop` workspace `@beim/desktop`: Electron main + preload + React renderer.
- Native window: System title bar, native menu, quit/logout.
- **One native React dashboard view** (client count + recent orders via `@beim/data`), not a whole-admin re-implementation.
- Data via **IPC bridge (preload) → main → `@beim/data`** (Prisma singleton in main; renderer sandboxed).
- Workspace wiring (turbo/pnpm), ultra-strict TS, `dev`/`build`/`typecheck`/`lint`, packaging scaffold.
- Smoke test + README.

### Out of Scope (Deferred)
- Full native re-implementation of every admin view; web-shell wrapping gestion.
- Auto-update, code signing, distribution; offline/local DB; native boleta printing.
- Auth beyond minimal session context.

## Capabilities

### New Capabilities
- `desktop-app`: Electron+React shell (main/preload/renderer), native window, IPC data bridge to `@beim/data`, one dashboard view, packaging scaffold.

### Modified Capabilities
- None (orthogonal new app).

## Approach

Native Electron+React. `main.ts` owns `BrowserWindow` + Prisma-backed IPC handlers calling `@beim/data`; `preload.ts` exposes typed `window.beim`; renderer consumes it (sandbox + clean layering). Dev via Electron + Vite dev task in Turborepo; main uses `tsconfig/node.json`, renderer `tsconfig/react.json`. `electron-builder` scaffold; signing/distribution deferred. **Multi-slice**: MVP (this) → native dashboard wiring → boleta → cash/stock/orders → auto-update/offline.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/desktop/` | New | Electron main/preload/renderer |
| `packages/tsconfig/` | Modified | Add `electron.json` |
| `turbo.json` | Modified | `dev` wiring |
| `openspec/specs/desktop-app/` | New | Main spec |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Electron native deps in CI | Med | Pin builder; skip signing on CI |
| Admin-view duplication grows scope | Med | MVP = one dashboard; rest in slices |
| Prisma leaks into renderer | Low | Preload-only bridge |

## Rollback Plan

Safe — new orthogonal `apps/desktop`; no existing app touched. Revert: remove `apps/desktop`, revert `turbo.json`/package.json.

## Dependencies

- `@beim/contracts`, `@beim/domain`, `@beim/data` (existing); Electron + electron-builder + Vite (new devDeps).

## Success Criteria

- [ ] `pnpm typecheck --filter @beim/desktop` passes (ultra-strict).
- [ ] `pnpm build --filter @beim/desktop` produces a launchable Electron bundle.
- [ ] Window opens with native title bar/menu, renders dashboard (client count + recent orders) via IPC.
- [ ] Smoke test passes.

## Assumptions

- Reuses shared backend/DB; no schema change.
- Native React shell (honors Electron+React), not a web wrapper.
- Renderer sandboxed; all DB access in main via IPC.
