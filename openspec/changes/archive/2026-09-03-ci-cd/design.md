# Design: CI/CD Quality Gates for Monorepo

## Technical Approach

Single umbrella `.github/workflows/ci.yml` enforcing `install → quality → test → build` on push/PR to `main`. Verifying the repo confirmed: root `packageManager: pnpm@11.3.0`; `pnpm-lock.yaml` is committed (493 KB); root scripts (`lint`/`typecheck`/`test`/`build`/`generate`) delegate to turbo; `turbo.json` declares `globalEnv: ["DATABASE_URL","NODE_ENV"]` and all quality tasks depend on `^build`; `pnpm-workspace.yaml` `allowBuilds` covers electron/expo/prisma/sharp/react-native; each app builds offline (web/gestion `next build`, desktop `electron-vite build`, mobile `expo export`); `prisma generate` uses `prisma-client-js` with `url = env("DATABASE_URL")` (generate never connects). `.env` is gitignored, so `DATABASE_URL` must be injected via workflow env.

## Architecture Decisions

### ADR: Umbrella single workflow
| Option | Tradeoff | Decision |
|---|---|---|
| One `ci.yml`, multiple jobs | One file, one trigger set, clear DAG; scales via separate workflows later | **Choose** |
| Per-gate separate workflows | Fragmented triggers/status checks, harder to reason about | Rejected |

Rationale: MVP slice; mirrors proposal + spec `ci-quality-gates`. Later slices can split.

### ADR: Install job + artifact sharing (not per-job reinstall)
| Option | Tradeoff | Decision |
|---|---|---|
| `install` job uploads `node_modules` artifact; downstream `needs: install` downloads it | One cold install; downstream jobs share it via artifact | **Choose** |
| Each job runs `pnpm install --frozen-lockfile` with per-job cache | Simpler YAML but N cold installs / cache keys per job | Rejected |

Rationale: spec's mandatory chain `install → quality → test → build` requires a shared, deterministic install. `pnpm install` is the slowest step; run it once with turbo cache bucketed by commit.

### ADR: Separate quality/test/build jobs (spec-mandated graph)
| Option | Tradeoff | Decision |
|---|---|---|
| `install → quality(lint+typecheck) → test → build` separate jobs | Distinct status checks; failing gate blocks downstream; turbo `^build` caches outputs across jobs | **Choose** |
| Single `quality` job chaining all gates | One status check, but spec requires per-gate skip semantics | Rejected |

Rationale: spec Requirement "Job Dependency Chain" is fixed. Turbo `dependsOn: ["^build"]` causes each job's task graph to run the dependency builds first; because local turbo cache (`node_modules/.cache/turbo`) is persisted via the shared artifact, the second/third job hit cache for `^build`. `quality` runs `lint` and `typecheck`; `build` after `test` (matches spec order; `build` is the merge-blocker).

### ADR: prisma generate inside install job
| Option | Tradeoff | Decision |
|---|---|---|
| Run `pnpm generate` in `install`, right after install, before artifact upload | Deterministic: generated client bundled into the shared artifact; downstream jobs never regenerate | **Choose** |
| Regenerate per downstream job | Redundant work; race on shared workspace | Rejected |

Rationale: generated `@prisma/client` output is workspace-local (from `prisma generate` run per `@beim/data`). Generating once and shipping it in the artifact keeps every downstream job identical. `prisma generate` is offline (never connects).

### ADR: No live DB in CI (MVP)
| Option | Tradeoff | Decision |
|---|---|---|
| Provide CI-only placeholder `DATABASE_URL`; no Postgres service | `prisma generate` + Next builds resolve without DB; no external dependency | **Choose** |
| Run Postgres service container | Enables DB e2e, but out of MVP scope (Slice 3) | Rejected |

Rationale: spec requires deterministic, no-live-DB runs. Placeholder `DATABASE_URL: postgresql://localhost:5432/dummy` satisfies turbo `globalEnv` and Prisma schema resolution; `prisma generate` and offline builds never connect.

### ADR: Global turbo gates (reuse root scripts)
| Option | Tradeoff | Decision |
|---|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` via turbo | Reuses root scripts + turbo cache/remote-cache future-proofing; automatic workspace coverage | **Choose** |
| Per-workspace `pnpm -r` / explicit filters | Bypasses turbo scheduling, cache, and `^build` ordering | Rejected |

Rationale: `turbo.json` already wires task deps and `globalEnv`. Exact commands:
- `install`: `corepack enable && pnpm install --frozen-lockfile` then `pnpm generate`
- `quality`: `pnpm lint && pnpm typecheck`
- `test`: `pnpm test`
- `build`: `pnpm build`

## Data Flow

    push main / PR→main
         │
         ▼
      install ──(DATABASE_URL placeholder, corepack, pnpm install --frozen-lockfile)──▶ generate (prisma)
         │  upload node_modules + .cache/turbo artifact
         ▼ needs
      quality  (pnpm lint && pnpm typecheck)
         │ needs
      ▼
      test  (pnpm test)
         │ needs
      ▼
      build  (pnpm build)  ──▶ merge-blocking status check on main

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | Create | Umbrella CI: triggers, install+generate job, 3 quality gate jobs, artifact sharing, env |
| `.github/workflows/` | Create | Workflow directory (new) |

No app/package config changes — CI is additive config.

## Interfaces / Contracts

Workflow skeleton (concrete non-obvious parts):

```yaml
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
permissions: { contents: read }
defaults: { run: { shell: bash } }
env: { DATABASE_URL: "postgresql://localhost:5432/dummy", NODE_ENV: "production" }

jobs:
  install:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm, cache-dependency-path: pnpm-lock.yaml }
      - run: corepack enable && pnpm --version   # asserts 11.3.0
      - run: pnpm install --frozen-lockfile       # allowBuilds respected
      - run: pnpm generate                         # prisma, offline, placeholder URL
      - uses: actions/upload-artifact@v4
        with: { name: workspace, path: node_modules, retention-days: 1,
                include-hidden-files: true }      # ships node_modules + .cache/turbo
  quality:
    runs-on: ubuntu-latest
    needs: install
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4 { name: workspace, path: . }
      - run: pnpm lint && pnpm typecheck
  test:
    runs-on: ubuntu-latest
    needs: quality
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4 { name: workspace, path: . }
      - run: pnpm test
  build:
    runs-on: ubuntu-latest
    needs: test
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4 { name: workspace, path: . }
      - run: pnpm build
```

Node 22 chosen: no `engines`/`.nvmrc` in repo; expo~54 / React Native 0.81 / Next 15 all require Node ≥20; 22 LTS is the safe common floor. When exporting artifact+restoring, `setup-node cache: pnpm` + `node_modules` download both restore; their interplay is verified in apply.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Integration | Workflow triggers & skip semantics | Push to `feat/*` must not trigger; PR→main does; downgrade via introducing a deliberate lint/typecheck/test/build error and confirm the gate fails + downstream skips |
| Integration | Frozen lockfile, corepack pin | Confirm `pnpm --version` = 11.3.0; `--frozen-lockfile` succeeds with allowBuilds (electron/expo native) |
| Integration | prisma generate offline + placeholder | Confirm `pnpm generate` exits 0 with no DB and placeholder URL |
| Integration | Build without DB | Confirm web/gestion/desktop/mobile all build green |
| E2E | Required status check gate | Repo-admin sets branch protection requiring `install/quality/test/build` on main; a failing-GH run blocks merge (env-only; YAML note only) |

## Threat Matrix

| Boundary | Applicability | Design response |
|---|---|---|
| Shell commands / subprocesses | **Applicable** — `install`/`generate`/`lint`/`typecheck`/`test`/`build` run via bash | `defaults.run.shell: bash`; `set -euo pipefail` implicit; failure of any root script exits non-zero → job fails → downstream `needs` skips |
| Process integration | **Applicable** — job graph `needs` chain | Each gate only runs if upstream succeeds; a gate failure marks the run failed and blocks merge |
| Git repository selection | N/A — checkout is fixed depth default, no `-C`/refspec |
| Commit/push state | N/A — read-only checkouts, no pushes |
| PR commands | N/A — no PR write/comment automation in this slice (Slice 2 `pr-gates.yml`) |
| Executable-file classification | N/A — running npm scripts only |

Expected safe behavior: a green push/PR produces 4 passing jobs; any failing gate fails the run and blocks merge. Planned RED test: a forcing error in each gate must fail its job and skip downstream jobs.

## Migration / Rollout

No migration required. Rollout is additive: commit `.github/workflows/ci.yml`; jobs appear on the PR's CI. **Repo-admin step (out of YAML scope, noted for the ADR)**: after the workflow is green on `main`, enable branch protection and mark `install`, `quality`, `test`, `build` as required status checks for PR→main.

## Open Questions

- [ ] Does `node_modules` artifact (with `include-hidden-files`) preserve turbo's `.cache/turbo` badly enough that downstream `^build` runs re-execute? Expected: cache hits; verified in apply — if re-runs occur, MVP still correct, just slower (acceptable within scope).
