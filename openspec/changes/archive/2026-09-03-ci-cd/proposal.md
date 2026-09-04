# Proposal: CI/CD Quality Gates for Monorepo

## Intent

The monorepo (4 apps: web/gestion/desktop/mobile; 4 packages: tsconfig/contracts/domain/data; Prisma; Turborepo + pnpm) has zero CI. Every change is verified manually or not at all, so regressions reach `main` undetected. This change adds a deterministic GitHub Actions CI that enforces lint, typecheck, test, and build before merge, protecting the ported legacy system as it grows.

## Scope

### In Scope
- `.github/workflows/ci.yml`: single umbrella workflow running `install → lint → typecheck → test → build` on push & PR to `main`.
- Node + pnpm setup via `actions/setup-node`, pin `pnpm@11.3.0` via corepack, `pnpm install --frozen-lockfile` with `allowBuilds` respected and action `cache: pnpm`.
- Run turbo tasks globally (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) — reuse existing root scripts / cache.
- `pnpm generate` (`prisma generate`) before data-dependent build/test.
- Required status checks enforced for PRs.

### Out of Scope
- DB service container / migration + e2e workflow (deferred to later slice).
- Deploy workflows (Vercel/Node for web/gestion, EAS for mobile, electron-builder release).
- Coverage upload, scheduled jobs, PR size/conventional-commit guards.

## Capabilities

### New Capabilities
- `ci-quality-gates`: GitHub Actions CI enforcing lint, typecheck, test, and build on push/PR to `main` using pnpm + Turborepo.

### Modified Capabilities
- None

## Approach

Single `ci.yml` (minimal-but-sufficient for MVP; one runner, shared setup). Jobs: `install` (setup-node, corepack pnpm 11.3.0, `pnpm install --frozen-lockfile`, cache `node_modules` + pnpm store) → `quality` (lint, typecheck) → `test` (vitest per workspace via turbo) → `build` (turbo build; Next no-DB, electron-vite, expo export). Prisma `generate` runs within the same `install` job so downstream jobs are deterministic. No live Postgres: build/test already use offline/vitest + no-DB pattern. Four 400-line budgets respected; `.github/workflows/ci.yml` is config, no app code changes.

`prisma generate` depends on `DATABASE_URL` being set for the datasource block — turbo declares `DATABASE_URL` as globalEnv. Just scripting `pnpm generate` may fail env resolution; the apply phase MUST verify and, if needed, provide a CI-only placeholder `DATABASE_URL` (e.g. a dummy postgres URL) since `prisma generate` does not connect to the DB. Recorded as a risk.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | New | Umbrella CI workflow |
| `.github/workflows/` (dir) | New | Workflow directory |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Prisma generate needs `DATABASE_URL` | Med | Script placeholder CI-only URL in install job |
| Electron install slow/no GPU | Med | Prebuilt binaries via pnpm allowBuilds; no GUI needed for build |
| Turbo cache in CI | Med | Rely on action `cache: pnpm` + `pnpm-lock.yaml`; outputs cached |
| pnpm 11.3.0 corepack availability | Low | Pin exact version in `packageManager` + corepack |

## Rollback Plan

Delete `.github/workflows/ci.yml` and unset required status checks. Adding workflows is orthogonal — no app code, dependency, or config change, so removal is low-risk and instant.

## Dependencies

- GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup` or corepack).
- GitHub-hosted `ubuntu-latest`.
- `pnpm-lock.yaml` present (pins pnpm 11.3.0).

## Success Criteria

- [ ] `ci.yml` runs install+lint+typecheck+test+build green on push & PR to `main`.
- [ ] All 4 apps and 4 packages build and test in CI.
- [ ] `pnpm install --frozen-lockfile` succeeds with allowBuilds.
- [ ] Required status checks are set and enforced on PRs.
- [ ] Deterministic: no flaky/live-DB dependency in the workflow.

## Multi-Slice Plan

1. **Slice 1 (this)**: umbrella `ci.yml` + install fix + status checks.
2. **Slice 2**: `pr-gates.yml` — conventional-commit check, PR size guard, diff-aware jobs.
3. **Slice 3**: DB service container + migration + e2e workflow (manual/scheduled).
4. **Slice 4**: deploy workflows (Vercel/Node, EAS, electron release), coverage upload.
