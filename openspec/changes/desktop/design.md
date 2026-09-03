# Design: Desktop App (Electron + React)

## Technical Approach

Add an orthogonal `apps/desktop` workspace (`@beim/desktop`) hosting a native Electron shell: a **main** process owning the `BrowserWindow` and a Prisma-backed IPC layer, a **sandboxed preload** exposing a typed `window.beim` bridge, and a **React + Tailwind** renderer with one dashboard view. All data flows renderer → preload bridge → main → `@beim/data` (reusing the existing Prisma singleton and `listClients`/`listOrders`). Covers spec requirements R1–R10 (19 scenarios). Deferred slices (packaging/signing, auto-update, boleta) are explicitly excluded.

Verified against the workspace: `@beim/data` already exports `prisma`, `listClients`, `listOrders`; `packages/tsconfig` already ships `base/node/react`; turbo defines `build/dev/lint/typecheck/test` globally; pnpm 11 supports `allowBuilds` in `pnpm-workspace.yaml`.

## Architecture Decisions

| # | Decision | Options / Tradeoff | Choice |
|---|----------|--------------------|--------|
| D1 | Renderer strategy | (a) Native Electron+React (b) web-shell wrapping gestion | **(a) native** — honors spec/proposal Electron+React; bounded MVP avoids admin duplication |
| D2 | Data boundary | (a) bridge-as-only-boundary (b) renderer imports @beim/data | **(a) bridge** — renderer sandboxed; DB isolated in main; lowest leak risk |
| D3 | Build pipeline | (a) `electron-vite` (b) dual `tsc` main/preload + Vite renderer | **(a) electron-vite** — single config drives main/preload/renderer, HMR, clean with pnpm 11 + `@beim/tsconfig/react.json` |
| D4 | Main tsconfig | (a) `@beim/tsconfig/node.json` (b) new `electron.json` | **(a) node.json** — spec R1 mandates node.json for main/preload; no new tsconfig file needed (resolves proposal/spec drift in favor of spec) |
| D5 | Prisma location | (a) reuse `@beim/data` singleton in main (b) new desktop-local client | **(a) reuse** — `packages/data` already owns the singleton; avoids duplicate client/connection |
| D6 | No-live-DB | (a) IPC handler try/catch → empty defaults (b) throw | **(a) degrade** — spec R4/R6 mandate `{ clientCount: 0, recentOrders: [] }`; matches web/gestion behavior |

**Rejected alternative**: web-shell wrapper (D1-b) — duplicates whole admin, grows scope, contradicts confirmed Electron+React decision.

## Data Flow

```
Renderer(React) ──window.beim.getDashboardMetrics()──▶ Preload (contextBridge)
       ▲                                                      │ ipcRenderer.invoke('dashboard:getMetrics')
       │ ◀────────────────typed response────────────────────  ▼
       │                                              Main (ipcMain.handle)
       │                                                      │  @beim/data
       │                                                      ▼
       └────────────────── payload ◀────────────── prisma.listClients + listOrders
                          (try/catch → empty defaults)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/desktop/package.json` | Create | `@beim/desktop`; scripts `dev/build/typecheck/lint/test/package`; deps `@beim/contracts`/`@beim/data`; devDeps electron, electron-builder, electron-vite, react, react-dom, tailwind, vitest, jsdom |
| `apps/desktop/tsconfig.json` | Create | project refs node (main/preload) + web (renderer) |
| `apps/desktop/tsconfig.node.json` | Create | extends `@beim/tsconfig/node.json` |
| `apps/desktop/tsconfig.web.json` | Create | extends `@beim/tsconfig/react.json` |
| `apps/desktop/electron.vite.config.ts` | Create | main/preload/renderer build config |
| `apps/desktop/src/main/index.ts` | Create | `BrowserWindow` (native title bar), `Menu` (quit), `ipcMain.handle('dashboard:getMetrics')` |
| `apps/desktop/src/preload/index.ts` | Create | `contextBridge.exposeInMainWorld('beim', …)` typed bridge |
| `apps/desktop/src/shared/ipc.ts` | Create | channel const + `DashboardMetrics` + `BeimBridge` |
| `apps/desktop/src/renderer/` | Create | `index.html`, `main.tsx`, `App.tsx`, `Dashboard.tsx`, `globals.css`, Tailwind |
| `apps/desktop/electron-builder.yml` | Create | packaging scaffold |
| `apps/desktop/eslint.config.mjs` | Create | ban `@beim/data`/`@prisma/client` in renderer |
| `apps/desktop/vitest.config.ts` | Create | jsdom, react plugin, setup |
| `pnpm-workspace.yaml` | Modify | add `allowBuilds`: electron, electron-winstaller, electron-builder |
| `turbo.json` | Modify | add `desktop#dev/build/typecheck/lint/test` |

## Interfaces / Contracts

```ts
// src/shared/ipc.ts
export const IPC_CHANNELS = { dashboardGetMetrics: 'dashboard:getMetrics' } as const

export interface DashboardMetrics {
  clientCount: number
  recentOrders: Order[]           // @beim/contracts Order
}

// Preload bridge — window.beim
export interface BeimBridge {
  getDashboardMetrics(): Promise<DashboardMetrics>
}
```

Declared globally in a renderer ambient d.ts: `interface Window { beim: BeimBridge }`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | IPC handler maps `@beim/data` → `{clientCount, recentOrders}`; degrades on DB failure | vitest, mock `@beim/data`; assert empty defaults |
| Unit | Bridge contract (`dashboard:getMetrics` channel) | vitest, assert channel const + handler registration |
| Unit | Renderer import ban | eslint rule test (no `@beim/data`/`@prisma/client`) |
| Renderer | Dashboard smoke (mount, renders metrics + empty state) | vitest + jsdom + @testing-library/react |

E2E: not in MVP — launching Electron is out of scope for CI; deferred with packaging.

## Threat Matrix

Per `references/threat-matrix.md`: routing N/A; shell/subprocess — **Applicable**: Electron main spawns child renderer/preload processes within the app (not shell), and `electron-vite`/`electron-builder` invoke node/electron binaries. Design response: all process boundaries stay inside Electron's sandbox; no user-supplied shell commands; `window.beim` exposes no Node/child_process. RED tests: bridge does NOT expose raw `ipcRenderer`/Node; renderer cannot import `@beim/data`/`@prisma/client` (eslint). Git/PR automation N/A. Executable-file classification N/A (no auto-run of arbitrary paths).

## Migration / Rollout

No migration — orthogonal new app. Rollout: merge adds `apps/desktop` + turbo/workspace wiring; independent of existing apps. No feature flags. Packaging is scaffold-only (electron-builder available, `package` script present) — distribution deferred.

## Open Questions

- [ ] Precompile `@beim/data` (`workspace:*` is raw `.ts`) in main bundle, or add a `build` dep so electron-vite bundles ESM `@beim/data`? (electron-vite bundles main deps by default; confirm at tasks)
