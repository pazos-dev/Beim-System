# @beim/desktop

Electron + React native desktop shell for Beim System. This is the host package for future native slices (boleta, cash, stock, orders).

## Data boundary

- **Main process** owns `@beim/data` (Prisma singleton) and registers IPC handlers.
- **Preload** exposes a typed `window.beim` bridge via `contextBridge`.
- **Renderer** accesses data ONLY through `window.beim` — never imports `@beim/data` or `@prisma/client` (enforced by ESLint `no-restricted-imports`).

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

## Scripts

| Command                                 | What it does                                              |
| --------------------------------------- | --------------------------------------------------------- |
| `pnpm --filter @beim/desktop dev`       | Launch Electron with Vite dev server (HMR renderer)       |
| `pnpm --filter @beim/desktop build`     | electron-vite build → `out/` (main/preload/renderer)      |
| `pnpm --filter @beim/desktop typecheck` | Ultra-strict `tsc --noEmit`                               |
| `pnpm --filter @beim/desktop lint`      | ESLint (includes renderer import ban)                     |
| `pnpm --filter @beim/desktop test`      | Vitest (jsdom + react)                                    |
| `pnpm --filter @beim/desktop package`   | electron-builder (scaffold only; no signing/distribution) |

## Build without a database

All build/lint/typecheck/test commands pass WITHOUT a running Postgres. The IPC handler catches DB errors and returns empty defaults (`{ clientCount: 0, recentOrders: [] }`), so dev mode degrades gracefully.

## Layout

```
src/
├── main/          Electron main process (window, menu, IPC handlers)
│   ├── index.ts
│   └── handler.ts
├── preload/       contextBridge typed bridge
│   └── index.ts
├── renderer/      React + Tailwind dashboard
│   ├── Dashboard.tsx
│   ├── App.tsx
│   └── main.tsx
└── shared/        Shared IPC channel contract + types
    └── ipc.ts
```

Tests are co-located (`*.test.ts/tsx`) and run under Vitest with jsdom.
