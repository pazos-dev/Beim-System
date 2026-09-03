# Proposal: Monorepo Foundation

## Intent

Port the BEIM system (vanilla JS storefront + admin panel) to a modern TypeScript monorepo. This change establishes the foundational workspace infrastructure that every future package and app will build on. Without it, no successor change (apps, domain packages, data layer) can proceed.

## Scope

### In Scope

- Root config finalization: `prettier` config, `.gitignore` (verify completeness), `AGENTS.md` (delegation contract), `README.md`
- `packages/tsconfig/react.json` — React/React Native TS base extending `base.json` (currently listed in `package.json` `files` but missing)
- Verify and validate all existing bootstrap artifacts are complete and consistent: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `packages/tsconfig/base.json`, `packages/tsconfig/node.json`
- Root-level `README.md` with project overview, workspace structure, and getting-started instructions

### Out of Scope

- **4 apps**: `apps/web`, `apps/gestion`, `apps/desktop`, `apps/mobile` — successor changes
- **4 packages**: `packages/contracts`, `packages/domain`, `packages/data`, `packages/ui` — successor changes
- Any app code, domain logic, database schema, or authentication
- ESLint config (planned with lint task; no package defines a `lint` script yet)
- Vitest installation (planned; unlocked when a package needs testing)

## Capabilities

### New Capabilities

- `monorepo-workspace`: Root workspace config — pnpm workspaces, Turborepo task pipeline, root dev tooling (prettier, typescript)
- `tsconfig-shared`: Shared TypeScript configurations — ultra-strict base.json, node.json, react.json exported via `@beim/tsconfig`

### Modified Capabilities

None — no specs exist yet. This is the foundation change.

## Approach

1. Audit existing bootstrap files for correctness and completeness
2. Create missing `packages/tsconfig/react.json` (extends base, adds JSX/React Native settings)
3. Add root `prettier` config (`.prettierrc.mjs` or equivalent)
4. Write `AGENTS.md` — delegation contract for multi-agent workflow
5. Write `README.md` — project overview, workspace structure, prerequisites, getting started
6. Validate: `pnpm install`, `turbo run build` (should succeed with zero packages), `pnpm format` (prettier check)

## Affected Areas

| Area                           | Impact | Description                                      |
| ------------------------------ | ------ | ------------------------------------------------ |
| `packages/tsconfig/react.json` | New    | React/React Native TS config extending base.json |
| `prettier` config (root)       | New    | Project-wide formatting rules                    |
| `AGENTS.md` (root)             | New    | Multi-agent delegation contract                  |
| `README.md` (root)             | New    | Project overview and getting started             |
| `packages/tsconfig/base.json`  | Verify | Already exists; validate completeness            |
| `packages/tsconfig/node.json`  | Verify | Already exists; validate completeness            |
| `turbo.json`                   | Verify | Already exists; task pipeline complete           |
| `.gitignore`                   | Verify | Already exists; verify coverage                  |

## Risks

| Risk                                                  | Likelihood | Mitigation                                                              |
| ----------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `react.json` JSX config conflicts with future apps    | Low        | Extend base.json cleanly; React apps use `@beim/tsconfig/react.json`    |
| pnpm workspace resolution breaks with future packages | Low        | Standard `apps/*` + `packages/*` pattern; validate with empty workspace |
| Missing `.gitignore` entries for future tooling       | Low        | Include common patterns now (node_modules, dist, .env, coverage)        |

## Rollback Plan

1. Remove all files created in this change (`react.json`, prettier config, `AGENTS.md`, `README.md`)
2. Verify git status returns to pre-change state
3. All existing bootstrap files (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `packages/tsconfig/base.json`, `packages/tsconfig/node.json`) are unchanged and remain valid

## Dependencies

- `pnpm@11.3.0` installed on the system
- Bootstrap artifacts (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `packages/tsconfig/`) already exist

## Success Criteria

- [ ] `pnpm install` completes without errors
- [ ] `turbo run build` succeeds (zero packages = no-op, no errors)
- [ ] `pnpm format` runs prettier without crashing
- [ ] `packages/tsconfig/react.json` exists and extends `base.json` with JSX support
- [ ] `README.md` ends with a trailing newline, is non-empty, and contains workspace overview
- [ ] `AGENTS.md` documents the SDD delegation contract
- [ ] `.gitignore` covers node_modules, dist, .env, coverage, .turbo, .next
