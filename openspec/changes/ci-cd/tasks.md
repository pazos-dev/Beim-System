# Tasks: CI/CD Quality Gates for Monorepo

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150–250 (single `.github/workflows/ci.yml`) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR (one YAML file, additive config) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | New `.github/workflows/ci.yml` (install→quality→test→build) | PR 1 | `pnpm install --frozen-lockfile && pnpm generate && pnpm lint && pnpm typecheck && pnpm test && pnpm build` (run locally with `DATABASE_URL=postgresql://localhost:5432/dummy`) | N/A — GitHub-hosted runner not available locally; validate YAML locally + rely on a real push/PR trigger to `feat/ci-cd`→`main` | Delete `ci.yml` + unset status checks; additive config, no app code |

Focused local proof (apply must run): `DATABASE_URL=postgresql://localhost:5432/dummy pnpm install --frozen-lockfile && pnpm generate && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Phase 1: Workflow Scaffold (events, env, concurrency)

- [x] 1.1 Create `.github/workflows/` and `ci.yml` skeleton with `on: push {branches:[main]}` + `on: pull_request {branches:[main]}`; accept: triggers only on main/push->main, not `feat/*`.
- [x] 1.2 Add `concurrency: {group: ci-${{ github.ref }}, cancel-in-progress: true}` and `permissions: {contents: read}`; accept: ref-scoped job cancellation, read-only token (SM: not a risk—no write needed).
- [x] 1.3 Set top-level `env: {DATABASE_URL: "postgresql://localhost:5432/dummy", NODE_ENV: "production"}` and `defaults: {run: {shell: bash}}`; accept: matches turbo `globalEnv` (verify turbo.json) resolves without `.env`.

## Phase 2: Install Job (shared deterministic install + generate)

- [x] 2.1 Add `install` job (`runs-on: ubuntu-latest`, `timeout-minutes: 15`): `actions/checkout@v4` + `actions/setup-node@v4` (`node-version: 22`, `cache: pnpm`, `cache-dependency-path: pnpm-lock.yaml`); accept: node 22 (expo/RN/Next floor) + pnpm store cache restore.
- [x] 2.2 Step `corepack enable && pnpm --version` asserting `11.3.0`; accept: output `11.3.0` (RED: force `pnpm@11.3.1` → step fails).
- [x] 2.3 Step `pnpm install --frozen-lockfile` (allowBuilds from pnpm-workspace.yaml honored); accept: install exits 0, `pnpm-lock.yaml` unmutated (RED: add a dep → install fails frozen).
- [x] 2.4 Step `pnpm generate` (prisma, offline, placeholder URL from env); accept: `pnpm generate` exits 0 with no DB (RED: unset `DATABASE_URL` → generate fails env resolution).
- [x] 2.5 Step `actions/upload-artifact@v4` (`name: workspace`, `path: node_modules`, `retention-days: 1`, `include-hidden-files: true`) shipping `node_modules` + `.cache/turbo`; accept: `install` artifact downloadable by downstream jobs.

## Phase 3: Quality, Test, Build Jobs (spec-mandated graph)

- [x] 3.1 Add `quality` job (`needs: install`): `actions/download-artifact@v4` (`workspace`, `path: .`) + `pnpm lint && pnpm typecheck`; accept: turbo runs both gates, 0 exit (RED: introduce lint + typecheck error → job fails).
- [x] 3.2 Add `test` job (`needs: quality`): download artifact + `pnpm test` (vitest offline/DB-free); accept: turbo runs tests, 0 exit (RED: failing test → job fails, `build` skipped).
- [x] 3.3 Add `build` job (`needs: test`): download artifact + `pnpm build` (web/gestion `next build`, desktop `electron-vite build`, mobile `expo export`); accept: all 4 apps + 4 packages produce artifacts offline, 0 exit (RED: compile error → build fails).
- [x] 3.4 Assert `needs` chain `install→quality→test→build` and per-gate skip semantics; accept: upstream failure skips downstream (spec "Job Dependency Chain").

## Phase 4: Verification & PR Enforcement

- [x] 4.1 Validate YAML: `actionlint` if installable else `yq`/online action schema; fallback grep for `needs`/`uses`/`runs-on` typos; accept: no syntax/action-reference errors.
- [x] 4.2 Run local determinant proof (see Work Units): `DATABASE_URL=postgresql://localhost:5432/dummy pnpm install --frozen-lockfile && pnpm generate && pnpm lint && pnpm typecheck && pnpm test && pnpm build`; accept: all exit 0 (proves CI determinism offline).
- [x] 4.3 Push `ci.yml` to `feat/ci-cd` + open PR→`main`; accept: workflow triggers on PR; `feat/*` push alone does NOT trigger (spec scenario).
- [x] 4.4 Run a deliberate per-gate RED forcing error once; accept: each gate fails and downstream skips (threat-matrix expected safe behavior).
- [x] 4.5 Repo-admin note (out of YAML scope): after `main` green, enable branch protection requiring `install`/`quality`/`test`/`build`; accept: PRs blocked until CI passes.
- [x] 4.6 Document open question in design: `.cache/turbo` retention via artifact; if `^build` re-runs downstream (cache miss), MVP still correct but slower (accepted).

## Phase 5: Cleanup

- [x] 5.1 Remove any deliberate RED-test forcing errors / temporary debug steps.
- [x] 5.2 Add brief header comment to `ci.yml` describing pipeline + env requirements; accept: self-documenting for future slices.

## Acceptance Mapping

Each task's unsafe case (RED) must fail its job and block merge; green run must produce 4 passing jobs with no live-DB dependency. Success criteria from spec: install+lint+typecheck+test+build green on push/PR→main; all 8 workspaces covered; `--frozen-lockfile` + allowBuilds succeed; status checks enforced; deterministic.
