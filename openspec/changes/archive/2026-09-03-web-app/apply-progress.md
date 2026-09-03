# Apply Progress — Web App (Next.js Storefront)

**Change**: `web-app`
**Mode**: Strict TDD (openspec/config.yaml `strict_tdd: true`, Vitest runner present)
**Batch**: 1 (first apply — no prior work)
**Date**: 2026-09-03
**Branch**: `feat/web-app`
**Delivery**: auto-chain, stacked-to-main

## Summary

Created `apps/web` from scratch as a standalone Next.js 15 App Router storefront package
(`@beim/web`). Implemented the read-only catalog slice over `@beim/data` access functions
with ultra-strict TypeScript, Tailwind CSS, ESLint flat config, and Vitest behavioral tests.
No live DB required for the gate — all data routes are dynamically rendered and safely
degrade to empty states when Prisma/DB is unavailable, so `next build` passes standalone.

## Completed Tasks

### Phase 1: Scaffold (all complete)
- [x] 1.1 `apps/web/package.json` — `@beim/web`, next/react/react-dom/workspace deps/tailwind; scripts
- [x] 1.2 `apps/web/tsconfig.json` extends `@beim/tsconfig/react.json` (+ Next-specific)
- [x] 1.3 `apps/web/next.config.mjs` `transpilePackages` for @beim/* packages
- [x] 1.4 `apps/web/tailwind.config.ts` + `postcss.config.mjs` (store-pro tokens)
- [x] 1.5 `apps/web/app/globals.css` + `.env.example` (`DATABASE_URL`)
- [x] 1.6 `apps/web/app/layout.tsx` root shell `runtime='nodejs'`
- [x] 1.7 `apps/web/vitest.config.ts` + format-helper smoke/behavioral tests

### Phase 2: Storefront Catalog (all complete)
- [x] 2.1 `apps/web/lib/format.ts` pure price/currency helpers (TDD)
- [x] 2.2 `ProductCard.tsx` / `ProductGrid.tsx` / `CategoryNav.tsx` (typed)
- [x] 2.3 `apps/web/app/page.tsx` home grid via `listProducts()` + empty-state
- [x] 2.4 `apps/web/app/categoria/[id]/page.tsx` filtered + empty-state
- [x] 2.5 `apps/web/app/producto/[id]/page.tsx` `getProductById`; null→`notFound()`
- [x] 2.6 `not-found.tsx` + `loading.tsx`; responsive 1/2/4-col grid; read-only

### Phase 3: Wiring & Verification (all complete)
- [x] 3.1 typecheck + build + lint green for `@beim/web`
- [x] 3.2 Root turbo build/typecheck full-suite green (no package regressions)
- [x] 3.3 Legacy `pagina-web` untouched; `DATABASE_URL` wired via `.env.example`

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/web/package.json` | Created | `@beim/web` config, deps, scripts |
| `apps/web/tsconfig.json` | Created | extends `@beim/tsconfig/react.json`, Next additions |
| `apps/web/next.config.mjs` | Created | `transpilePackages` for @beim/* |
| `apps/web/tailwind.config.ts` | Created | store-pro tokens (teal/navy/Inter/Manrope) |
| `apps/web/postcss.config.mjs` | Created | @tailwindcss/postcss |
| `apps/web/eslint.config.mjs` | Created | flat config (eslint-config-next) |
| `apps/web/app/globals.css` | Created | Tailwind v4 `@import 'tailwindcss'` + theme vars |
| `apps/web/app/layout.tsx` | Created | root shell `runtime='nodejs'`, nav + footer |
| `apps/web/app/page.tsx` | Created | home catalog grid |
| `apps/web/app/not-found.tsx` | Created | 404 page |
| `apps/web/app/loading.tsx` | Created | loading fallback |
| `apps/web/app/categoria/[id]/page.tsx` | Created | filtered listing |
| `apps/web/app/producto/[id]/page.tsx` | Created | product detail |
| `apps/web/components/ProductCard.tsx` | Created | presentational card (typed) |
| `apps/web/components/ProductGrid.tsx` | Created | responsive grid |
| `apps/web/components/CategoryNav.tsx` | Created | nav bar |
| `apps/web/lib/format.ts` | Created | pure format helpers |
| `apps/web/vitest.config.ts` + `.setup.ts` | Created | jsdom testing harness |
| `apps/web/.env.example` | Created | `DATABASE_URL` |
| `pnpm-workspace.yaml` | Modified | `allowBuilds` unrs-resolver |
| `pnpm-lock.yaml` | Modified | dep wiring |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 format | `lib/format.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 12 cases | ✅ Clean |
| 2.2 ProductCard | `components/ProductCard.test.tsx` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 10 cases | ✅ Clean |
| 2.2 CategoryNav | `components/CategoryNav.test.tsx` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean |

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm --filter @beim/web exec vitest run` → 3 files, 26/26 passed, exit 0 |
| Runtime harness command/scenario and exact result | `pnpm --filter @beim/web exec next build` → SUCCEEDED; routes `/`, `/categoria/[id]`, `/producto/[id]` all build (dynamic) |
| Rollback boundary | Revert branch; delete `apps/web/*` + revert `pnpm-workspace.yaml` allowBuilds and `pnpm-lock.yaml` |

## Full Validation Output

- `pnpm install` (root) — SUCCEEDS (allowBuilds updated for unrs-resolver)
- `pnpm --filter @beim/web exec tsc --noEmit` — exit 0
- `pnpm --filter @beim/web exec eslint .` — exit 0 (0 errors, 0 warnings)
- `pnpm --filter @beim/web exec next build` — SUCCEEDS (Prod optimized)
- `pnpm --filter @beim/web exec vitest run` — 26/26 passed, exit 0
- `pnpm test` (root turbo) — 7/7 tasks successful; contracts 62 + domain 144 + data 101 + web 26 = 333 tests green
- `pnpm typecheck` (root) — 7/7 tasks successful
- `pnpm dlx turbo run build` — 4/4 tasks successful

## Deviations from Design

None material — implementation matches design. Minor notes:
- Fonts: used `font-family` CSS tokens (Inter/Manrope) declared in the Tailwind theme instead
  of `next/font/google` to keep the build hermetic (no network font fetch at build time). The
  tokens are present; swapping to next/font is a non-breaking enhancement.
- Lint: used flat `eslint.config.mjs` (eslint-config-next) rather than deprecated `next lint`.
- Home nav categories are rendered inline in `layout.tsx` instead of reusing `CategoryNav`
  component (which exists and is tested) because the header styling differs slightly. The
  `CategoryNav` component is fully implemented and tested for reuse in future slices.

## Issues Found

None blocking. Build gate is DB-independent: all data routes are dynamically rendered
(`export const runtime = 'nodejs'`), and DB fetch failures degrade to empty states so
`next build` succeeds without a live Postgres.

## Commits

| Hash | Message |
|------|---------|
| `5eac6d1` | feat(web-app): scaffold Next.js storefront host (@beim/web) |
| `a691d89` | feat(web-app): add storefront catalog with listing, category filter, and product detail |
| `fc5efb0` | chore(web-app): wire @beim/web workspace deps into lockfile |
| `87d2272` | chore(web-app): add ESLint flat config and fix internal-link rule violations |
| `04e251d` | chore(web-app): mark all web-app tasks complete and update lockfile with ESLint deps |

## Status

16/16 tasks complete. Ready for sdd-verify.
