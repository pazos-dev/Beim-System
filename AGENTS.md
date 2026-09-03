# Agent Delegation Contract

This document defines how AI agents interact with the BEIM System Tech monorepo. It is the single source of truth for delegation rules, sub-agent invocation, and the SDD phase lifecycle.

## Project Context

| Field            | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| Repository       | `beim-system-tech` — TypeScript monorepo                     |
| Package manager  | pnpm 11.3.0 (pinned via `packageManager`)                    |
| Orchestrator     | Turborepo                                                    |
| Workspace layout | `apps/*` + `packages/*`                                      |
| Tech stack       | TypeScript (ultra-strict), React 19, Node.js                 |
| Port sources     | `pagina-web/` (storefront), `sistema-gestion/` (admin panel) |

## SDD Phase Lifecycle

All changes follow Spec-Driven Development (SDD). Each phase produces a persisted artifact and feeds the next:

```
explore → propose → spec → design → tasks → apply → verify → archive
```

| Phase   | What It Produces                           | Key Gate                              |
| ------- | ------------------------------------------ | ------------------------------------- |
| explore | Exploration analysis                       | Confirms the problem is worth solving |
| propose | Change proposal (intent, scope, rollback)  | Approved by maintainer                |
| spec    | Delta specs with requirements/scenarios    | All acceptance criteria defined       |
| design  | Technical design (ADRs, architecture)      | Approach frozen                       |
| tasks   | Task breakdown with workload forecast      | PR budget checked                     |
| apply   | Implementation + commits                   | Code matches spec + design            |
| verify  | Verification report                        | All scenarios pass                    |
| archive | Delta merged into main specs, change moved | Audit trail complete                  |

## Conventions

| Convention | Rule                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| TypeScript | Ultra-strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, ...) |
| Commits    | Conventional commits only (`feat:`, `fix:`, `chore:`, `docs:`)                                       |
| Tests      | Tests accompany code in the same commit/work unit                                                    |
| Artifacts  | All code, docs, comments, and commit messages in English                                             |
| PR budget  | Max 400 changed lines per PR; chain larger changes                                                   |
| OpenSpec   | Delta specs use `ADDED`/`MODIFIED`/`REMOVED`/`RENAMED` sections                                      |

## Skill → Task Mapping

| Task Pattern                     | Skill                  |
| -------------------------------- | ---------------------- |
| Understanding codebase structure | `sdd-explore`          |
| Writing a proposal               | `sdd-propose`          |
| Defining requirements            | `sdd-spec`             |
| Technical design                 | `sdd-design`           |
| Breaking into tasks              | `sdd-tasks`            |
| Implementing code                | `sdd-apply`            |
| Verifying implementation         | `sdd-verify`           |
| Archiving completed change       | `sdd-archive`          |
| Creating a PR                    | `branch-pr`            |
| Splitting oversized PRs          | `chained-pr`           |
| Writing documentation            | `cognitive-doc-design` |
| Creating GitHub issues           | `issue-creation`       |

## Quality Rules

1. **No commits without context**: Every change must trace back to an SDD task or an approved proposal.
2. **Tests with code**: Never commit behavior without its verification in the same work unit.
3. **400-line budget**: If a change exceeds 400 changed lines, split into chained PRs.
4. **English artifacts**: Code, comments, docs, and commit messages default to English.
5. **No AI attribution**: Never add `Co-Authored-By` or AI tags to commits.

## Workspace Commands

| Command          | What It Does                                    |
| ---------------- | ----------------------------------------------- |
| `pnpm install`   | Install all workspace dependencies              |
| `pnpm dev`       | Start all apps in dev mode via Turborepo        |
| `pnpm build`     | Build all packages and apps (topological order) |
| `pnpm format`    | Format all files with Prettier                  |
| `pnpm typecheck` | Type-check all packages via Turborepo           |
| `pnpm lint`      | Lint all packages (when ESLint is configured)   |
| `pnpm test`      | Run all tests via Turborepo                     |
