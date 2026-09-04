# CI Quality Gates Specification

## Purpose

GitHub Actions CI workflow that enforces lint, typecheck, test, and build on push/PR to `main` for the Beim monorepo (4 apps + 4 packages) using pnpm 11.3.0 + Turborepo.

## Requirements

### Requirement: Workflow Trigger Configuration

The CI workflow SHALL trigger on push to `main` and on pull requests targeting `main`.

#### Scenario: Push to main triggers CI

- GIVEN a developer pushes a commit to `main`
- WHEN GitHub Actions evaluates the workflow trigger
- THEN the `ci.yml` workflow runs automatically

#### Scenario: PR targeting main triggers CI

- GIVEN a developer opens a PR targeting `main`
- WHEN GitHub Actions evaluates the workflow trigger
- THEN the `ci.yml` workflow runs automatically

#### Scenario: Push to non-main branch does not trigger CI

- GIVEN a developer pushes a commit to `feat/foo`
- WHEN GitHub Actions evaluates the workflow trigger
- THEN the `ci.yml` workflow does NOT run

### Requirement: Node and pnpm Setup

The install job SHALL set up Node.js via `actions/setup-node@v4`, enable corepack, and activate pnpm 11.3.0 (matching the `packageManager` field in root `package.json`).

#### Scenario: Corepack enables pinned pnpm version

- GIVEN the install job starts on `ubuntu-latest`
- WHEN `corepack enable` runs with pnpm 11.3.0 activated
- THEN `pnpm --version` returns `11.3.0`

### Requirement: Dependency Installation with Frozen Lockfile

The install job SHALL run `pnpm install --frozen-lockfile` with pnpm store caching enabled. The workflow SHALL respect `allowBuilds` from `pnpm-workspace.yaml` for native packages (Prisma, electron, sharp, expo, react-native).

#### Scenario: Clean install succeeds with frozen lockfile

- GIVEN a fresh CI runner with no cached `node_modules`
- WHEN `pnpm install --frozen-lockfile` executes
- THEN all workspace dependencies install successfully
- AND no `pnpm-lock.yaml` mutations occur

#### Scenario: Cached install reuses pnpm store

- GIVEN a previous CI run cached the pnpm store
- WHEN `pnpm install --frozen-lockfile` executes
- THEN the pnpm store cache is restored before install
- AND install completes faster than a cold install

### Requirement: Prisma Generate

The install job SHALL run `prisma generate` (via `pnpm generate`) after dependency installation. The workflow SHALL set a placeholder `DATABASE_URL` (e.g. `postgresql://localhost:5432/dummy`) before running generate, since `turbo.json` declares it as `globalEnv` and Prisma requires it at resolution time even though generate never connects.

#### Scenario: Prisma generate succeeds with placeholder URL

- GIVEN dependencies are installed and `DATABASE_URL` is set to a placeholder value
- WHEN `pnpm generate` runs via turbo
- THEN Prisma client types are generated for all workspaces
- AND no database connection is attempted

#### Scenario: Generate runs without database connection

- GIVEN no live Postgres instance exists in the CI environment
- WHEN `prisma generate` executes
- THEN the command completes successfully with exit code 0

### Requirement: Quality Gate — Lint

The quality gate SHALL run `pnpm lint` (which delegates to `turbo run lint`) after install completes. Lint failures SHALL block subsequent jobs.

#### Scenario: Lint passes across all workspaces

- GIVEN all workspace code has no lint errors
- WHEN `pnpm lint` runs via turbo
- THEN the command exits with code 0
- AND all workspaces are linted (web, gestion, desktop, mobile, tsconfig, contracts, domain, data)

#### Scenario: Lint failure blocks the pipeline

- GIVEN at least one workspace contains a lint error
- WHEN `pnpm lint` runs via turbo
- THEN the command exits with a non-zero code
- AND the CI workflow is marked as failed

### Requirement: Quality Gate — Typecheck

The quality gate SHALL run `pnpm typecheck` (which delegates to `turbo run typecheck`) after install completes. Typecheck failures SHALL block subsequent jobs.

#### Scenario: Typecheck passes across all workspaces

- GIVEN all workspace code has no TypeScript errors
- WHEN `pnpm typecheck` runs via turbo
- THEN the command exits with code 0

#### Scenario: Typecheck failure blocks the pipeline

- GIVEN at least one workspace has a TypeScript error
- WHEN `pnpm typecheck` runs via turbo
- THEN the command exits with a non-zero code
- AND the CI workflow is marked as failed

### Requirement: Quality Gate — Test

The quality gate SHALL run `pnpm test` (which delegates to `turbo run test`) after install completes. Tests run via vitest in offline/DB-free mode. Test failures SHALL block subsequent jobs.

#### Scenario: All tests pass

- GIVEN all workspace tests are green
- WHEN `pnpm test` runs via turbo
- THEN the command exits with code 0

#### Scenario: Test failure blocks the pipeline

- GIVEN at least one workspace test fails
- WHEN `pnpm test` runs via turbo
- THEN the command exits with a non-zero code
- AND the CI workflow is marked as failed

### Requirement: Quality Gate — Build

The quality gate SHALL run `pnpm build` (which delegates to `turbo run build`) after install completes. The build MUST work without a live database (Next.js no-DB pattern, electron-vite, expo export). Build failures SHALL block merge.

#### Scenario: All workspaces build successfully

- GIVEN all workspace source code compiles
- WHEN `pnpm build` runs via turbo
- THEN all 4 apps (web, gestion, desktop, mobile) and 4 packages produce build artifacts
- AND the command exits with code 0

#### Scenario: Build failure blocks the pipeline

- GIVEN at least one workspace fails to build
- WHEN `pnpm build` runs via turbo
- THEN the command exits with a non-zero code
- AND the CI workflow is marked as failed

### Requirement: Job Dependency Chain

The workflow SHALL enforce sequential job dependencies: `install → quality (lint + typecheck) → test → build`. Each downstream job SHALL only run if its dependency succeeds.

#### Scenario: Downstream jobs skip on upstream failure

- GIVEN the install job fails
- WHEN GitHub Actions evaluates job dependencies
- THEN quality, test, and build jobs are NOT executed

#### Scenario: Lint failure skips test and build

- GIVEN the install job succeeds but lint fails
- WHEN GitHub Actions evaluates job dependencies
- THEN test and build jobs are NOT executed

### Requirement: Required Status Checks for Merge

The workflow's jobs SHALL serve as required status checks on `main`. PRs targeting `main` MUST NOT be mergeable until all CI jobs pass.

#### Scenario: PR blocked when CI fails

- GIVEN a PR targets `main` and CI jobs fail
- WHEN a reviewer attempts to merge
- THEN GitHub blocks the merge due to missing required status checks

#### Scenario: PR mergeable when CI passes

- GIVEN a PR targets `main` and all CI jobs pass
- WHEN a reviewer merges
- THEN the merge proceeds (if other checks also pass)

### Requirement: Monorepo Coverage

The CI workflow SHALL build and test all 4 applications (web, gestion, desktop, mobile) and all 4 packages (tsconfig, contracts, domain, data) in a single run.

#### Scenario: All workspaces covered in CI

- GIVEN a CI run executes the full pipeline
- WHEN turbo runs each task
- THEN all workspaces under `apps/*` and `packages/*` are included in the task graph

## Success Criteria

| Criterion | Verification |
|-----------|-------------|
| `ci.yml` runs install+lint+typecheck+test+build green | Workflow run shows all jobs passing |
| All 4 apps and 4 packages build and test | Turbo task graph includes all workspaces |
| `pnpm install --frozen-lockfile` succeeds | Install job passes with `--frozen-lockfile` |
| Required status checks enforced on PRs | GitHub branch protection rules block unpassing PRs |
| Deterministic: no flaky/live-DB dependency | No database service container in workflow; prisma generate uses placeholder URL |
