# desktop-app Specification

## Purpose

Electron + React native desktop shell in `apps/desktop` (`@beim/desktop`). Provides a native window with an IPC bridge to `@beim/data` (Prisma in main), one dashboard view, and packaging scaffold. This is the host package for future native slices (boleta, cash, stock, orders).

## Requirements

### Requirement: App Package Structure

`apps/desktop` SHALL be a standalone workspace package with `package.json` (name `@beim/desktop`), Electron, electron-builder, and Vite as dev dependencies. `tsconfig.json` SHALL extend `@beim/tsconfig/node.json` for main/preload and a separate React config for renderer.

#### Scenario: Package resolves in workspace

- GIVEN `apps/desktop/package.json` exists with `"name": "@beim/desktop"`
- WHEN `pnpm install` runs from workspace root
- THEN `@beim/desktop` resolves without errors
- AND `node_modules/@beim/desktop` is a symlink to `apps/desktop`

#### Scenario: TypeScript extends shared configs

- GIVEN main/preload tsconfig extends `@beim/tsconfig/node.json` and renderer extends React config
- WHEN `pnpm typecheck --filter @beim/desktop` runs
- THEN ultra-strict checks (noUncheckedIndexedAccess, exactOptionalPropertyTypes) are enforced across all entry points

### Requirement: Electron Main Process

The main process (`main.ts`) SHALL create a `BrowserWindow` with system title bar, load the renderer, and register IPC handlers that delegate to `@beim/data`. Prisma client SHALL be instantiated as a singleton in the main process only.

#### Scenario: Window launches with native title bar

- GIVEN the Electron app is built
- WHEN the app starts
- THEN a `BrowserWindow` opens with a native OS title bar
- AND the window loads the React renderer

#### Scenario: Native menu includes quit option

- GIVEN the app is running on any OS
- WHEN the user activates the application menu
- THEN a quit/exit option is available and terminates the app

### Requirement: Preload Bridge

A `preload.ts` script SHALL expose a typed `window.beim` API via `contextBridge.exposeInMainWorld`. The bridge SHALL declare IPC invoke channels for dashboard data. The renderer SHALL access data ONLY through this bridge — direct Node/Prisma imports are prohibited.

#### Scenario: Bridge exposes typed API

- GIVEN the Electron app has loaded the renderer
- WHEN the preload script runs
- THEN `window.beim` is defined and exposes typed IPC invoke methods
- AND `window.beim` does NOT expose raw `ipcRenderer` or Node APIs

#### Scenario: Renderer cannot import Prisma directly

- GIVEN the renderer source files
- WHEN `pnpm typecheck --filter @beim/desktop` runs
- THEN no renderer file imports from `@prisma/client` or `@beim/data`
- AND typecheck passes (import ban enforced at type level or lint rule)

### Requirement: Dashboard IPC Handler

The main process SHALL register an IPC handler for `dashboard:getMetrics` that calls `@beim/data` functions (`listClients`, `listOrders`) and returns a typed payload with client count and recent orders. The handler SHALL degrade gracefully when the database is unavailable — returning empty defaults, not throwing.

#### Scenario: Handler returns dashboard data

- GIVEN the database is available and has clients/orders
- WHEN the renderer invokes `dashboard:getMetrics` via the preload bridge
- THEN the handler returns `{ clientCount: number, recentOrders: Order[] }`
- AND the payload satisfies `@beim/contracts` types

#### Scenario: Handler degrades without database

- GIVEN the database is unavailable (no running Postgres)
- WHEN the renderer invokes `dashboard:getMetrics`
- THEN the handler returns `{ clientCount: 0, recentOrders: [] }`
- AND no unhandled exception propagates to the renderer

### Requirement: Dashboard Renderer View

The React renderer SHALL display a single dashboard view with client count and a recent orders table, consuming data from the `window.beim` bridge. The view SHALL render empty states when data is unavailable.

#### Scenario: Dashboard renders metrics

- GIVEN the IPC bridge returns client count 5 and 3 recent orders
- WHEN the dashboard view mounts
- THEN the client count is displayed
- AND the recent orders table shows 3 rows

#### Scenario: Dashboard renders empty state

- GIVEN the IPC bridge returns `{ clientCount: 0, recentOrders: [] }`
- WHEN the dashboard view mounts
- THEN a zero/empty state message is shown instead of an error

### Requirement: Build Without Database

All build/lint/typecheck commands SHALL pass without a running Postgres instance. Prisma client generation MUST NOT be required at typecheck time for the renderer. Dev mode SHALL degrade gracefully (empty states) when DB is unreachable.

#### Scenario: Typecheck passes without Postgres

- GIVEN no Postgres instance is running
- WHEN `pnpm typecheck --filter @beim/desktop` runs
- THEN exit code is 0 with no errors

#### Scenario: Build succeeds without Postgres

- GIVEN no Postgres instance is running
- WHEN `pnpm build --filter @beim/desktop` runs
- THEN an Electron bundle is produced with exit code 0

### Requirement: Workspace Wiring

`turbo.json` SHALL include `desktop#dev`, `desktop#build`, and `desktop#typecheck` pipeline entries. The `dev` script SHALL launch Electron with Vite dev server for the renderer.

#### Scenario: Dev script starts Electron

- GIVEN the workspace is installed
- WHEN `pnpm dev --filter @beim/desktop` runs
- THEN Electron launches and the renderer loads in dev mode

### Requirement: Packaging Scaffold

`apps/desktop/package.json` SHALL include `electron-builder` configuration for producing platform installers. Actual signing and distribution are deferred — scaffold only.

#### Scenario: Package script exists

- GIVEN `apps/desktop/package.json`
- WHEN inspecting scripts
- THEN a `package` script invoking `electron-builder` is defined

### Requirement: Baseline Smoke Test

The app SHALL include unit tests for IPC/bridge wiring and a renderer smoke test verifying the dashboard renders.

#### Scenario: IPC wiring test passes

- GIVEN unit tests for the preload bridge and IPC handler exist
- WHEN `pnpm test --filter @beim/desktop` runs
- THEN all IPC/bridge wiring tests pass

#### Scenario: Renderer smoke test passes

- GIVEN a smoke test mounts the dashboard component
- WHEN `pnpm test --filter @beim/desktop` runs
- THEN the dashboard renders without throwing
