# Tasks: Web App (Next.js Storefront) — MVP Host Slice

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~850–950 (scaffold ~400, catalog ~450, deps/lockfile ~100) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 scaffold → PR 2 catalog → PR 3 wiring |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | apps/web scaffold + shell | PR 1 | `pnpm typecheck --filter @beim/web` + `pnpm test --filter @beim/web` | `pnpm dev --filter @beim/web` → 200 on `/` | Revert branch; delete `apps/web/*` config+layout |
| 2 | Storefront catalog (listing/filter/detail) | PR 2 | `pnpm test --filter @beim/web` (smoke+detail helpers) | `pnpm dev --filter @beim/web` browse `/categoria/cat-1`, `/producto/prod-1`, unknown→404 | Revert catalog components+routes only |
| 3 | Barrel/wiring: all-green gate | PR 3 | `pnpm build` + `pnpm typecheck` + `pnpm lint` root | `pnpm build` full electron build | Trivial — reverts to PR2 state |

## Phase 1: Scaffold (Foundation) — PR 1

- [x] 1.1 Create `apps/web/package.json` (`@beim/web`; deps `next`, `react`, `react-dom`, `@beim/contracts`/`domain`/`data` `workspace:*`, `tailwindcss`; scripts dev/build/typecheck/lint/test)
- [x] 1.2 Create `apps/web/tsconfig.json` extending `@beim/tsconfig/react.json` (+ Next-specific jsx/paths/next-env.d.ts)
- [x] 1.3 Create `apps/web/next.config.mjs` with `transpilePackages: ['@beim/contracts','@beim/domain','@beim/data']`
- [x] 1.4 Create `apps/web/tailwind.config.ts` + `postcss.config.mjs` with teal `#0c9f92`, navy `#17374b`, Inter/Manrope (store-pro tokens)
- [x] 1.5 Create `apps/web/app/globals.css` (Tailwind directives + font face), `apps/web/.env.example` (`DATABASE_URL`)
- [x] 1.6 Create `apps/web/app/layout.tsx` root shell (header BEIM brand + nav/`listCategories`, footer) with `runtime='nodejs'`
- [x] 1.7 Create `apps/web/vitest.config.ts` + baseline smoke test (RED: home renders; Strict TDD) for empty `/` — accepts 9 scenarios CLI: package resolve, TS extend, dev start, layout render, importable, prod build, node runtime, tailwind apply, smoke

## Phase 2: Storefront Catalog — PR 2

- [x] 2.1 Create `apps/web/lib/format.ts` pure price/currency helpers (RED→GREEN tests first; Strict TDD)
- [x] 2.2 Create `apps/web/components/ProductCard.tsx`, `ProductGrid.tsx`, `CategoryNav.tsx` (typed `Product`/`Category`; RED smoke tests; Strict TDD)
- [x] 2.3 Create `apps/web/app/page.tsx` home grid via `listProducts()` + empty-state
- [x] 2.4 Create `apps/web/app/categoria/[id]/page.tsx` filtered via `listProducts(id)` + `getCategoryById` + empty-state
- [x] 2.5 Create `apps/web/app/producto/[id]/page.tsx` via `getProductById`; null→`notFound()` (404)
- [x] 2.6 Create `apps/web/app/not-found.tsx` + `apps/web/app/loading.tsx`; responsive grid (1/2/4-col), read-only (no Prisma/`@beim/data` writes)

## Phase 3: Wiring & Verification — PR 3

- [x] 3.1 `pnpm typecheck` + `pnpm build` + `pnpm lint` green for `@beim/web` (ultra-strict; TS extend + typed-data scenarios)
- [x] 3.2 Root `pnpm typecheck`/`build` full-suite green (no regression to packages); confirm lockfile/dep wiring
- [x] 3.3 Confirm legacy `pagina-web` untouched; `DATABASE_URL` wired; seed data renders in dev

## Notes / Constraints

- Threat matrix is `N/A` (no shell/VCS/subprocess boundary) — no threat-matrix RED tasks.
- `apps/web` is new orthogonal package; rollback = revert branch (no legacy removal).
- Confirm Inter/Manrope delivery (next/font vs self-hosted) during apply (design open question).
