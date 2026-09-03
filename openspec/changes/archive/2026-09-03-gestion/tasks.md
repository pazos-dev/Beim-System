# Tasks: Admin Panel (`apps/gestion`) — MVP Slice 1

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (@beim/data) → PR 2 (scaffold) → PR 3 (dashboard) → PR 4 (clients reads) → PR 5 (clients writes) → PR 6 (wiring) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Note: the cross-package `@beim/data` soft-delete change (schema + mapper + access + contracts + tests) expands scope beyond `apps/gestion` alone and is sequenced FIRST as PR 1.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | @beim/data soft-delete (`active`) | PR 1 | `pnpm --filter @beim/data exec vitest run` + `pnpm --filter @beim/contracts exec vitest run` | `prisma migrate dev`; keep 101 data tests green | Revert `active` from schema/mapper/access+contracts; independent of app |
| 2 | apps/gestion scaffold + shell | PR 2 | `pnpm test --filter @beim/gestion` (smoke) | `pnpm dev --filter @beim/gestion` | Delete `apps/gestion/` |
| 3 | Dashboard (reads) | PR 3 | `pnpm test --filter @beim/gestion` (dashboard) | `pnpm dev` dashboard route (nodejs) | Remove page only |
| 4 | Clients list/search/detail | PR 4 | `pnpm test --filter @beim/gestion` (table) | `pnpm dev` clients route | Remove page only |
| 5 | Clients create/edit/soft-delete | PR 5 | `pnpm test --filter @beim/gestion` (form/actions) | `pnpm dev` form flow | Revert actions+form; relies on PR 1 active |
| 6 | Wiring final | PR 6 | `pnpm typecheck` + `pnpm test` + `pnpm build` | full `pnpm build` | Trivial; no feature revert |

## Phase 1: @beim/data Soft-Delete Prep (Strict TDD)

- [x] 1.1 RED: `packages/contracts/src/client.test.ts` — assert `clientSchema` requires `active: z.boolean()`
- [x] 1.2 GREEN: `packages/contracts/src/client.ts` — add `active: z.boolean()` (fix any type drift)
- [x] 1.3 RED: `packages/data/src/mapper/client.test.ts` — assert `toClientContract` emits `active`
- [x] 1.4 GREEN: `packages/data/src/mapper/client.ts` — include `active`
- [x] 1.5 `packages/data/prisma/schema.prisma` — add `active Boolean @default(true) @map("active")` to `GestionClient`
- [x] 1.6 RED: `packages/data/src/access/client.test.ts` — `listClients` filters `active:true`; `softDeleteClient(id)` sets `active:false`
- [x] 1.7 GREEN: `packages/data/src/access/client.ts` — filter `listClients`, add `softDeleteClient`, gate upsert on active
- [x] 1.8 `packages/data/src/index.ts` — export `softDeleteClient`
- [x] 1.9 Verify `pnpm --filter @beim/data exec vitest run` (all 105 tests) + `pnpm --filter @beim/contracts exec vitest run` (65 tests) green

## Phase 2: apps/gestion Scaffold

- [x] 2.1 Create `apps/gestion/package.json` (`@beim/gestion`, dev/build/typecheck/lint/test, deps next/react/tailwind/@beim/*/tanstack-query/vitest)
- [x] 2.2 Create `apps/gestion/tsconfig.json` (extends `@beim/tsconfig/react.json`, Next plugins, `@` alias)
- [x] 2.3 Create `next.config.mjs` (`transpilePackages`), `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.env.example`, `vitest.config.ts`, `vitest.setup.ts`
- [x] 2.4 Create `app/globals.css` (Tailwind v4 `@theme` teal/navy/pro-ink/Inter/Manrope), `app/layout.tsx` (QueryClient+AuthProvider), `not-found.tsx`, `loading.tsx`
- [x] 2.5 Create `app/(admin)/layout.tsx` (sidebar Dashboard/Clients + topbar + children)
- [x] 2.6 Create `components/sidebar.tsx`, `components/topbar.tsx`
- [x] 2.7 Create `lib/providers.tsx`, `lib/auth-context.tsx` (MockSession type + useAuth)
- [x] 2.8 Create `app/login/page.tsx` (posts `/api/gestion/management-login`, sets session in context)
- [x] 2.9 Create shell smoke test (sidebar nav + login) — scenario `Shell smoke test passes`
- [x] 2.10 Verify `pnpm typecheck`/`lint`/`test --filter @beim/gestion`

## Phase 3: Dashboard (Server Components, nodejs)

- [x] 3.1 RED: dashboard test — metrics render + empty-state (scenarios `Dashboard renders metrics`/`Empty data renders gracefully`)
- [x] 3.2 Create `app/(admin)/page.tsx` with `runtime='nodejs'`, metric counts via `@beim/data` (client count), recent orders + low-stock panels
- [x] 3.3 Verify dashboard tests green

## Phase 4: Clients List/Search/Detail (reads)

- [x] 4.1 RED: `client-table.test.tsx` — renders rows, search filter, empty state (scenarios `List renders clients`/`Empty list`/`Filter by name`/`No match`)
- [x] 4.2 Create `app/(admin)/clients/page.tsx` + `components/client-table.tsx` (search by name/document case-insensitive, client-side)
- [x] 4.3 Create `app/(admin)/clients/[id]/page.tsx` (`runtime='nodejs'`, `getClientById`, not-found state) — scenarios `View existing client`/`View missing`
- [x] 4.4 Verify table/detail tests green

## Phase 5: Clients Create/Edit/Soft-Delete (writes)

- [x] 5.1 RED: `actions.test.ts` — `createClient`/`updateClient` validate against `clientSchema`, reject invalid; `deleteClient` soft via `softDeleteClient` (scenarios `Reject invalid client`/`Create valid`)
- [x] 5.2 RED: `client-form.test.tsx` — inline validation errors, submit handler, empty-name reject (scenario `Reject invalid client`)
- [x] 5.3 Create `lib/actions/client.ts` (`"use server"`; createClient/updateClient/deleteClient; `upsertClient` + `softDeleteClient`)
- [x] 5.4 Create `components/client-form.tsx` (create/edit) + `components/confirm-dialog.tsx` (delete confirm) — scenarios `Edit existing`/`Delete confirmed`/`Deletion cancelled`
- [x] 5.5 Verify actions/form tests green

## Phase 6: Wiring Final

- [x] 6.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all green; confirm root `@beim/data` no regressions
- [x] 6.2 Manual `pnpm dev` smoke: login → dashboard → clients CRUD flow
