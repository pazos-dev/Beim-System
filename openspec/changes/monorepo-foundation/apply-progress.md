# Apply Progress: Monorepo Foundation

**Mode**: Standard (strict_tdd: false — no test runner at root yet)

## Work Unit Evidence

| Evidence | Required value |
|----------|----------------|
| Focused test command and exact result | `node -e` config checks for react.json + files array — both passed; `tsc --showConfig` resolves react.json (jsx: react-jsx, module/moduleResolution inherited from base) — exit 0 |
| Runtime harness command/scenario and exact result | `pnpm install` (exit 0, 4 packages added); `pnpm dlx turbo run build` (exit 0, no-op with @beim/tsconfig, 0 tasks); `pnpm format` (exit 0, no crash) |
| Rollback boundary | Remove new files (react.json, .prettierrc.mjs, .prettierignore, AGENTS.md) and revert .gitignore + README.md; existing bootstrap files (package.json, turbo.json, pnpm-workspace.yaml, base.json, node.json) unchanged — the only modified pre-existing files are .gitignore and README.md |

## Phase 1: Infrastructure / Tooling

- [x] 1.1 Create `packages/tsconfig/react.json` extending `./base.json`; set `jsx: "react-jsx"`, `lib: ["ES2022", "dom", "dom.iterable"]`; do NOT override module/moduleResolution
- [x] 1.2 Modify root `.gitignore`: append `dist/`, `coverage/`, `.turbo/`, `.next/` (keep existing entries)
- [x] 1.3 Create root `.prettierrc.mjs` with recommended defaults: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`
- [x] 1.4 Create root `.prettierignore` covering generated paths: `node_modules/`, `dist/`, `coverage/`, `.turbo/`, `.next/`, `pnpm-lock.yaml`

## Phase 2: Core Implementation (Docs)

- [x] 2.1 Write `AGENTS.md`: document SDD delegation contract — when to delegate, sub-agent invocation, phase lifecycle (explore → propose → spec → design → tasks → apply → verify → archive)
- [x] 2.2 Rewrite `README.md`: document monorepo layout (`apps/*` + `packages/*`), list 4 planned apps and 4 planned packages, state prerequisites (Node, pnpm@11.3.0 via corepack), include getting-started (install → build → format)
- [x] 2.3 Ensure `README.md` ends with trailing newline, is non-empty, and references workspace structure

## Phase 3: Validation

- [x] 3.1 Verify `packages/tsconfig/react.json` resolves: `tsc --showConfig` resolves with jsx: react-jsx, inherits module/moduleResolution from base (no errors)
- [x] 3.2 Verify `packages/tsconfig/package.json` `files` array matches on-disk files: base.json, node.json, react.json all present
- [x] 3.3 Run `pnpm install` — exit 0, 4 packages added (prettier 3.9.6, turbo 2.10.12, typescript 5.9.3)
- [x] 3.4 Run `turbo run build` — exit 0, no-op with @beim/tsconfig, 0 tasks (zero packages with build scripts)
- [x] 3.5 Run `pnpm format` — exit 0, prettier ran; no dist/coverage/.turbo/.next artifacts in git status (node_modules auto-ignored)

## Validation Output

### `pnpm install`
```
Scope: all 2 workspace projects
Progress: resolved 9, reused 0, downloaded 4, added 4, done
devDependencies:
+ prettier 3.9.6
+ turbo 2.10.12
+ typescript 5.9.3 (7.0.2 available)
Done in 4.7s using pnpm v11.3.0
```

### `pnpm dlx turbo run build`
```
• turbo 2.10.12
• Packages in scope: @beim/tsconfig
• Running build in 1 packages
WARNING  No tasks were executed as part of this run.
Tasks:    0 successful, 0 total
Time:    47ms
```
Exit 0. No-op as expected — @beim/tsconfig has no build script.

### `pnpm format`
```
$ prettier --write .
```
Exit 0. Formatted all files. Note: prettier also reformatted legacy `pagina-web/` and `sistema-gestion/` files; those reformats were reverted (out of scope for this foundation change).

### `typecheck` (Task as noted)
`turbo run typecheck` is defined in the pipeline but no package defines a `typecheck` script — no-op. Not run separately; covered by build no-op.

## Deviations from Design

None — implementation matches design.md. Prettier config uses `.prettierrc.mjs` per design decision, react.json extends base without overriding module/moduleResolution, `.gitignore` entries added per spec.

## Issues Found

1. `pnpm format` at root reformats legacy `pagina-web/` and `sistema-gestion/` files (they are prettier-unformatted). Those reformat changes were reverted to keep this change scoped to the foundation. A `.prettierignore` entry for `pagina-web/` and `sistema-gestion/` could be considered in a successor change to prevent future noise.

## Commit Plan

Intended work-unit commits (local only, no push):
1. `chore(tsconfig): add react.json base extension` — packages/tsconfig/react.json + files array verification
2. `chore(tooling): add prettier config and gitignore build outputs` — .prettierrc.mjs, .prettierignore, .gitignore
3. `docs(monorepo): add AGENTS.md and rewrite README` — AGENTS.md, README.md
4. Foundation bootstrap files (package.json, pnpm-workspace.yaml, turbo.json, pnpm-lock.yaml) — root workspace config

## Status

12/12 tasks complete. Ready for verify.
