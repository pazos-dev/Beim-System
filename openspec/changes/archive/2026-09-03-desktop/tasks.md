# Tasks: Desktop App (Electron + React)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100–1400 |
| 400-line budget risk | High |
| Chained PRs recommended | No (single-cohesive-PR; stacked work-unit commits) |
| Suggested split | Single PR in `apps/desktop` with 4 work-unit commits |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: High

> Rationale: NEW autonomous `apps/desktop` tree. Project convention = one cohesive PR per app with work-unit commits, even when >400 lines (new-app exception). No existing app touched; clean rollback boundary. `Decision needed before apply: No` per `auto-chain`.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Workspace + scaffold (package.json, tsconfigs, electron-vite, turbo/allowBuilds) | PR 1 (single) | `pnpm install && pnpm typecheck --filter @beim/desktop` | `pnpm dev --filter @beim/desktop` opens blank electron window | Remove `apps/desktop` + revert `pnpm-workspace.yaml`/`turbo.json` |
| 2 | Shared IPC contract + preload bridge + bridge contract test | PR 1 | `pnpm test --filter @beim/desktop` (bridge spec) | N/A (unit only; no Electron run) | Delete `src/shared/ipc.ts`, `src/preload/index.ts`, bridge test |
| 3 | Main process + IPC handler + handler unit test (mock @beim/data) | PR 1 | `pnpm test --filter @beim/desktop` (handler spec) | N/A (unit-only, mock data; no live DB) | Delete `src/main/*`, handler test |
| 4 | Renderer dashboard + smoke test + import-ban eslint | PR 1 | `pnpm test --filter @beim/desktop && pnpm lint --filter @beim/desktop` | `pnpm dev --filter @beim/desktop` dashboard renders | Delete `src/renderer/*`, renderer test, eslint rule |

## Phase 1: Foundation / Workspace Scaffold

- [x] 1.1 Create `apps/desktop/package.json` — `@beim/desktop`, scripts `dev/build/typecheck/lint/test/package`; deps `@beim/contracts`,`@beim/data`; devDeps electron, electron-builder, electron-vite, react, react-dom, tailwind, vitest, jsdom, @testing-library/react
- [x] 1.2 Create `apps/desktop/tsconfig.json` (project refs), `tsconfig.node.json` (extends `@beim/tsconfig/node.json`), `tsconfig.web.json` (extends `@beim/tsconfig/react.json`) — D4, no electron.json
- [x] 1.3 Create `apps/desktop/electron.vite.config.ts` — main/preload/renderer build; bundle `@beim/data` raw `.ts` (resolves design open question)
- [x] 1.4 Modify `pnpm-workspace.yaml` — add `allowBuilds`: electron, electron-winstaller, electron-builder
- [x] 1.5 Modify `turbo.json` — add `desktop#dev/build/typecheck/lint/test` (build/typecheck/lint/test `dependsOn ["^build"]`; dev persistent)

## Phase 2: Shared Bridge + Preload

- [x] 2.1 Create `src/shared/ipc.ts` — `IPC_CHANNELS.dashboardGetMetrics = 'dashboard:getMetrics'`, `DashboardMetrics {clientCount, recentOrders: Order[]}` (from `@beim/contracts`), `BeimBridge` interface
- [x] 2.2 RED test `src/preload/index.test.ts` — bridge exposes `getDashboardMetrics`; does NOT expose raw `ipcRenderer`/Node APIs (threat: no Node leakage)
- [x] 2.3 GREEN create `src/preload/index.ts` — `contextBridge.exposeInMainWorld('beim', { getDashboardMetrics: () => ipcRenderer.invoke(CHANNELS.dashboardGetMetrics) })`

## Phase 3: Main Process + IPC Handler

- [x] 3.1 RED test `src/main/index.test.ts` — handler maps `@beim/data` `listClients`+`listOrders` → `{clientCount, recentOrders}`; on DB throw returns `{clientCount:0, recentOrders:[]}` without throwing (R4/R6 degrade)
- [x] 3.2 GREEN create `src/main/index.ts` — `BrowserWindow` (native title bar), `Menu` with quit, `ipcMain.handle('dashboard:getMetrics', …)` calling mocked/real `@beim/data` inside try/catch → empty defaults

## Phase 4: Renderer Dashboard + Verification

- [x] 4.1 RED smoke test `src/renderer/Dashboard.test.tsx` — mounts, shows clientCount + recent-orders rows (5/3 case) and empty-state (0/[] case) (R5 scenarios)
- [x] 4.2 GREEN create `src/renderer/` — `index.html`, `main.tsx`, `App.tsx`, `Dashboard.tsx` consuming `window.beim.getDashboardMetrics`, `globals.css`, Tailwind; ambient `window.beim: BeimBridge` d.ts
- [x] 4.3 Create `apps/desktop/eslint.config.mjs` — ban `@beim/data`/`@prisma/client` imports in renderer (threat: renderer bypass)
- [x] 4.4 Create `electron-builder.yml` + `package` script — packaging scaffold (no signing/distribution) (R7)
- [x] 4.5 Create `vitest.config.ts` (jsdom, react plugin, setup) wiring tests 2.2/3.1/4.1
- [x] 4.6 Verify: `pnpm typecheck/lint/test/build --filter @beim/desktop` all pass without Postgres; README for `apps/desktop` (setup, dev, package boundary)

## Acceptance Gates

- [x] `pnpm test --filter @beim/desktop` — IPC handler, bridge contract, renderer smoke all pass
- [x] `pnpm typecheck --filter @beim/desktop` passes ultra-strict, no renderer import of `@beim/data`/`@prisma/client`
- [x] `pnpm lint --filter @beim/desktop` passes (import ban enforced)
- [x] `pnpm build --filter @beim/desktop` produces launchable Electron bundle; `pnpm dev` opens native-titlebar window rendering dashboard
