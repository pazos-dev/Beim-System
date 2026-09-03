# Tasks: Monorepo Foundation

## Review Workload Forecast

| Field                   | Value                            |
| ----------------------- | -------------------------------- |
| Estimated changed lines | ~180–250 (additions + deletions) |
| 400-line budget risk    | Low                              |
| Chained PRs recommended | No                               |
| Suggested split         | Single PR                        |
| Delivery strategy       | single-pr                        |
| Chain strategy          | pending                          |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal                                                                      | Likely PR | Focused test command                                                                                                                               | Runtime harness                                   | Rollback boundary                                                             |
| ---- | ------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | TS config fix — `packages/tsconfig/react.json` created                    | PR 1      | `ls packages/tsconfig/react.json` + `node -e "const c=require('./packages/tsconfig/react.json'); if(c.extends!=='./base.json') throw new Error()"` | N/A — config-only, zero packages/apps             | Remove `react.json`; `files` array returns to mismatch, nothing else affected |
| 2    | Root tooling — `.gitignore` entries, `.prettierrc.mjs`, `.prettierignore` | PR 1      | `pnpm format -- --check` (after config) + `git status` shows no dist/coverage/.turbo/.next                                                         | `pnpm format` formats all files without crash     | Remove added lines/entries; existing files untouched                          |
| 3    | Docs — `AGENTS.md` + `README.md` rewrite                                  | PR 1      | `test -s AGENTS.md && test -s README.md` + `[ -z "$(tail -c1 README.md)" ]`                                                                        | `less README.md` + `less AGENTS.md` reads cleanly | `git checkout` reverts both files                                             |
| 4    | Validation — `pnpm install` + `turbo run build` + `pnpm format`           | PR 1      | `pnpm install && turbo run build && pnpm format` all exit 0                                                                                        | Full workspace boot verification                  | No code to roll back; read-only                                               |

## Phase 1: Infrastructure / Tooling

- [x] 1.1 Create `packages/tsconfig/react.json` extending `./base.json`; set `jsx: "react-jsx"`, `lib: ["ES2022", "dom", "dom.iterable"]`; do NOT override module/moduleResolution
- [x] 1.2 Modify root `.gitignore`: append `dist/`, `coverage/`, `.turbo/`, `.next/` (keep existing `node_modules/`, `.env`, `.env.*`, `!.env.example`)
- [x] 1.3 Create root `.prettierrc.mjs` with recommended defaults: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`
- [x] 1.4 Create root `.prettierignore` covering common generated paths: `node_modules/`, `dist/`, `coverage/`, `.turbo/`, `.next/`, `pnpm-lock.yaml`

## Phase 2: Core Implementation (Docs)

- [x] 2.1 Write `AGENTS.md`: document SDD delegation contract — when to delegate, sub-agent invocation, phase lifecycle (explore → propose → spec → design → tasks → apply → verify → archive)
- [x] 2.2 Rewrite `README.md`: replace legacy vanilla-JS description; document monorepo layout (`apps/*` + `packages/*`), list 4 planned apps and 4 planned packages, state prerequisites (Node, pnpm@11.3.0 via corepack), include getting-started (install → build → format)
- [x] 2.3 Ensure `README.md` ends with trailing newline, is non-empty, and references workspace structure

## Phase 3: Validation

- [x] 3.1 Verify `packages/tsconfig/react.json` resolves: run `npx tsc --showConfig` with a minimal tsconfig extending it (no compiler errors)
- [x] 3.2 Verify `packages/tsconfig/package.json` `files` array matches on-disk files: `ls packages/tsconfig/` shows base.json, node.json, react.json
- [x] 3.3 Run `pnpm install` — dependencies resolve without errors across workspace
- [x] 3.4 Run `turbo run build` — succeeds (no-op with zero packages)
- [x] 3.5 Run `pnpm format` — prettier runs without crashing; verify `git status` shows no dist/coverage/.turbo/.next artifacts
