# Design: Monorepo Foundation

## Technical Approach

Establish workspace infrastructure (pnpm + Turborepo) and shared tooling (TS configs, Prettier, docs) that all 4 apps and 4 packages build on. Purely config/tooling — no app code. Validates with `pnpm install` + `turbo run build` + `pnpm format`.

## Architecture Decisions

| Decision              | Options                                         | Tradeoff                                                                                                   | Choice                                  |
| --------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Orchestrator          | Turborepo vs Lerna vs Nx vs manual              | Turborepo: fastest, zero-config, native caching. Lerna: maintenance mode. Nx: heavier. Manual: no caching. | **Turborepo**                           |
| Workspace layout      | `apps/*`+`packages/*` vs flat vs domain-grouped | Standard pattern, clear app/lib separation. Flat: confusing at scale. Domain-grouped: premature.           | **`apps/*`+`packages/*`**               |
| pnpm version          | Pin `pnpm@11.3.0` via `packageManager` vs loose | Pin: reproducible CI via `corepack enable`. Loose: drift risk.                                             | **Pin**                                 |
| TS config composition | `extends: ./base.json` vs full copy             | Extends: DRY, single source of truth. Copy: diverges silently.                                             | **Extends**                             |
| Prettier format       | `.prettierrc.mjs` vs `.json` vs `package.json`  | `.mjs`: comments + standard naming. `.json`: no comments. `package.json`: couples with deps.               | **`.prettierrc.mjs`**                   |
| ESLint                | Defer vs add now                                | Add now: complexity before any app needs it. Defer: clean foundation.                                      | **Defer** — no `lint` scripts exist yet |
| Validation            | 3-command suite vs custom tests                 | Simple: proves foundation works. Custom: overkill for config-only.                                         | **3-command suite**                     |

## Turbo Task Pipeline Contract

| Task        | `dependsOn` | `cache` | `outputs`                                |
| ----------- | ----------- | ------- | ---------------------------------------- |
| `build`     | `^build`    | true    | `dist/**`, `.next/**`, `!.next/cache/**` |
| `dev`       | —           | false   | —                                        |
| `lint`      | `^build`    | true    | —                                        |
| `typecheck` | `^build`    | true    | —                                        |
| `test`      | `^build`    | true    | `coverage/**`                            |
| `generate`  | —           | false   | —                                        |
| `clean`     | —           | false   | —                                        |

Extending for apps: each app/package adds its own scripts. Turbo auto-discovers — zero pipeline changes needed.

## TSConfig Composition

```
base.json       ← ultra-strict, module: ESNext, moduleResolution: Bundler
  ├── node.json  ← module: NodeNext, moduleResolution: NodeNext, types: ["node"]
  └── react.json ← jsx: "react-jsx", lib: ["ES2022", "dom", "dom.iterable"]
```

`react.json` does NOT override `module`/`moduleResolution` — each React app (web vs mobile) chooses its own.

## File Changes

| File                           | Action  | Description                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------- |
| `packages/tsconfig/react.json` | Create  | React/React Native TS config extending base.json                    |
| `.prettierrc.mjs`              | Create  | Root Prettier config                                                |
| `AGENTS.md`                    | Create  | SDD delegation contract                                             |
| `README.md`                    | Rewrite | Monorepo overview, workspace layout, prerequisites, getting started |
| `.gitignore`                   | Modify  | Add `dist/`, `coverage/`, `.turbo/`, `.next/`                       |

## Interfaces / Contracts

**`@beim/tsconfig`** — consumers: `"extends": "@beim/tsconfig/base.json"` (or `node.json`, `react.json`). All three files must exist and match `files` array.

**`turbo.json` pipeline** — tasks auto-discovered from package scripts. New apps/packages need zero turbo.json changes.

## Testing Strategy

| Layer       | What to Test                        | Approach                    |
| ----------- | ----------------------------------- | --------------------------- |
| Unit        | `react.json` extends base correctly | `tsc --showConfig` resolves |
| Integration | `pnpm install` resolves deps        | Zero errors at root         |
| Integration | `turbo run build` succeeds          | No-op with zero packages    |
| Integration | `pnpm format` runs prettier         | Root command succeeds       |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, or process-integration boundary.

## Migration / Rollout

No migration required — greenfield foundation change.

## Deferred Decisions

ESLint config, Vitest setup, app bundler choice (Vite/Expo/Electron), domain package structure, data layer (Drizzle/Prisma), UI component library — all belong to successor changes.

## Open Questions

None.
