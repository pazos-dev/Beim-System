# Apply Progress: Desktop App (Electron + React)

Status: **success** — all 16 tasks + 4 acceptance gates complete.

## Mode

- **Strict TDD**: active (`openspec/config.yaml` → `testing.strict_tdd: true`, `rules.apply.tdd: true`)
- Test runner: Vitest (jsdom + react)
- Delivery: `auto-chain`, `chain_strategy: stacked-to-main`, one cohesive PR with 4 work-unit commits.

## Work Unit Evidence

| Evidence | Required value |
|----------|----------------|
| Focused test command and exact result | `pnpm --filter @beim/desktop exec vitest run` → 3 files, 10/10 tests passed |
| Runtime harness command/scenario and exact result | `pnpm --filter @beim/desktop exec electron-vite build` → main/preload/renderer bundles produced in `out/` (exit 0, no Postgres). Electron window launch is E2E out of MVP scope (per design). |
| Rollback boundary | Remove `apps/desktop/` + revert `pnpm-workspace.yaml` (add 3 allowBuilds), `turbo.json` (add desktop#* tasks), `.gitignore`/`.prettierignore` (add `out/`). No existing app touched. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.2/2.3 (preload) | `src/preload/index.test.ts` | Unit | N/A (new) | ✅ Written (failed: module not found) | ✅ 3/3 passed | ✅ 3 cases (expose, channel, no-leak) | ➖ None needed (5-line file) |
| 3.1/3.2 (handler) | `src/main/handler.test.ts` | Unit | N/A (new) | ✅ Written (failed: module not found) | ✅ 4/4 passed | ✅ 4 cases (happy + 3 degrade) | ➖ None needed |
| 4.1/4.2 (renderer) | `src/renderer/Dashboard.test.tsx` | Integration | N/A (new) | ✅ Written (failed: module not found) | ✅ 3/3 passed | ✅ 3 cases (data, empty, mount) | ✅ Scoped selectors after duplicate-text query fix |
| 1.1–1.5, 4.3–4.6 (scaffold) | N/A (structural) | N/A | N/A | N/A | — | ➖ Structural only | — |

## Test Summary

- **Total tests written**: 10
- **Total tests passing**: 10
- **Layers used**: Unit (7: preload 3 + handler 4), Integration (3: renderer)
- **Approval tests**: None — no refactoring of existing code
- **Pure functions created**: `handleDashboardGetMetrics` (pure, dependency-injected via import), bridge contract types

## Verification Gates

| Gate | Command | Result |
|------|---------|--------|
| Install | `pnpm install` | ✅ succeed (electron/esbuild postinstall OK) |
| Test | `pnpm --filter @beim/desktop exec vitest run` | ✅ 10/10 |
| Typecheck | `pnpm --filter @beim/desktop exec tsc --noEmit` | ✅ clean |
| Lint | `pnpm --filter @beim/desktop exec eslint .` | ✅ clean (import ban verified with negative test) |
| Build | `pnpm --filter @beim/desktop exec electron-vite build` | ✅ out/main, out/preload, out/renderer (no Postgres) |
| Root typecheck | `pnpm typecheck` | ✅ 9/9 tasks |
| Root test | `pnpm test` | ✅ 9/9 tasks |
| Root build | `pnpm build` | ✅ 6/6 tasks |

## Design Resolutions / Deviations

1. **D1/D3 (electron-vite bundling `@beim/data`)**: Design open question resolved via `externalizeDeps: { exclude: ['@beim/data', '@beim/contracts'] }` — bundles raw TS workspace packages into the main bundle; `@prisma/client` stays external. Matches design intent (DB only in main, build green without live DB).
2. **electron-vite version**: design said `electron-vite` without a version; `^2.0.0` resolved to 2.3.0 which is incompatible with the workspace's Vite 7. Bumped to `^5.0.0` (supports Vite 5/6/7).
3. **ESLint config**: used `@eslint/js` + `typescript-eslint` flat config instead of `@eslint/eslintrc` FlatCompat (matches renderer import-ban need, fewer deps).
4. **Renderer tsconfig web include**: `src/shared` added to renderer tsconfig so `BeimBridge` type is visible to renderer via `../../shared/ipc` import.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/desktop/package.json` | Created | `@beim/desktop`, scripts, deps/devDeps |
| `apps/desktop/tsconfig.json` | Created | project refs |
| `apps/desktop/tsconfig.node.json` | Created | extends `@beim/tsconfig/node.json` |
| `apps/desktop/tsconfig.web.json` | Created | extends `@beim/tsconfig/react.json` |
| `apps/desktop/electron.vite.config.ts` | Created | main/preload/renderer build; bundles `@beim/data` |
| `apps/desktop/eslint.config.mjs` | Created | renderer import ban (`@beim/data`/`@prisma/client`) |
| `apps/desktop/vitest.config.ts` | Created | jsdom, react plugin, setup |
| `apps/desktop/vitest.setup.ts` | Created | jest-dom + cleanup |
| `apps/desktop/electron-builder.yml` | Created | packaging scaffold |
| `apps/desktop/README.md` | Created | setup, dev, data-boundary docs |
| `apps/desktop/src/shared/ipc.ts` | Created | `IPC_CHANNELS`, `DashboardMetrics`, `BeimBridge` |
| `apps/desktop/src/preload/index.ts` | Created | contextBridge typed bridge |
| `apps/desktop/src/preload/index.test.ts` | Created | bridge contract tests |
| `apps/desktop/src/main/index.ts` | Created | BrowserWindow, Menu, IPC registration |
| `apps/desktop/src/main/handler.ts` | Created | `handleDashboardGetMetrics` (degrade on DB error) |
| `apps/desktop/src/main/handler.test.ts` | Created | handler tests |
| `apps/desktop/src/renderer/Dashboard.tsx` | Created | dashboard view (metrics + orders table + empty state) |
| `apps/desktop/src/renderer/Dashboard.test.tsx` | Created | renderer smoke/behavior tests |
| `apps/desktop/src/renderer/App.tsx` | Created | app root |
| `apps/desktop/src/renderer/main.tsx` | Created | React root mount |
| `apps/desktop/src/renderer/index.html` | Created | renderer HTML entry |
| `apps/desktop/src/renderer/globals.css` | Created | Tailwind import |
| `apps/desktop/src/renderer/env.d.ts` | Created | ambient `window.beim: BeimBridge` |
| `pnpm-workspace.yaml` | Modified | allowBuilds: electron, electron-winstaller, electron-builder |
| `turbo.json` | Modified | desktop#dev/build/typecheck/lint/test |
| `.gitignore` / `.prettierignore` | Modified | add `out/` |
| `pnpm-lock.yaml` | Modified | lockfile update |

## Issues Found

- electron-vite 2.x (from `^2.0.0`) is incompatible with the repo's Vite 7 — resolved by bumping to `^5.0.0`.
- `desktop#build` turbo output-hash warning (benign): electron-vite writes `out/**` which turbo's glob reports as "no output files" on a cached run; the build itself produces artifacts and succeeds.
