# Apply Progress — Admin Panel (`apps/gestion`) MVP Slice 1

**Change**: gestion
**Status**: All tasks complete (33/33)
**Mode**: Strict TDD
**Delivery**: auto-chain, stacked-to-main
**Date**: 2026-09-03

## Completed Tasks (all phases)

### Phase 1: @beim/data Soft-Delete Prep (Strict TDD)
- [x] 1.1 RED: contract `clientSchema` requires `active: z.boolean()`
- [x] 1.2 GREEN: add `active` to `clientSchema`
- [x] 1.3 RED: mapper emits `active`
- [x] 1.4 GREEN: mapper includes `active`
- [x] 1.5 schema: add `active Boolean @default(true)` to GestionClient
- [x] 1.6 RED: access filters `active:true`, `softDeleteClient`
- [x] 1.7 GREEN: filter listClients, add softDeleteClient, gate upsert
- [x] 1.8 index.ts export `softDeleteClient`
- [x] 1.9 Verify all tests green (105 data + 65 contracts)

### Phase 2: apps/gestion Scaffold
- [x] 2.1–2.10 All scaffold tasks complete (package.json, tsconfig, configs, layout, shell components, auth context, login, smoke tests, verify)

### Phase 3: Dashboard
- [x] 3.1–3.3 Dashboard tests + Server Component page + graceful empty state

### Phase 4: Clients List/Search/Detail
- [x] 4.1–4.4 Client table, search, detail view, not-found state

### Phase 5: Clients Create/Edit/Soft-Delete
- [x] 5.1–5.5 Server actions, form validation, confirm dialog, delete

### Phase 6: Wiring Final
- [x] 6.1 Build/typecheck/test/lint all green, no data regressions
- [x] 6.2 Dev smoke documented

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `packages/contracts/src/client.test.ts` | Unit | ✅ 62/62 | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| 1.3 | `packages/data/src/mapper/client.test.ts` | Unit | ✅ 101/101 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 1.6 | `packages/data/src/access/client.test.ts` | Unit | ✅ 101/101 | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 3.1 | `apps/gestion/lib/__tests__/dashboard.test.tsx` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 cases | ✅ Clean |
| 4.1 | `apps/gestion/lib/__tests__/client-table.test.tsx` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ Clean |
| 5.1 | `apps/gestion/lib/__tests__/actions.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean |
| 5.2 | `apps/gestion/lib/__tests__/client-form.test.tsx` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |

## Work Unit Evidence

| Unit | Focused test command + result | Runtime harness | Rollback boundary |
|------|-------------------------------|-----------------|-------------------|
| 1 (soft-delete) | `pnpm --filter @beim/data exec vitest run` → 105 passed | `prisma generate` ok; `prisma migrate dev` (not run — no live DB) | Revert `active` from schema/mapper/access+contracts; independent of app |
| 2 (scaffold) | `pnpm --filter @beim/gestion exec vitest run` → 5 passed | `pnpm --filter @beim/gestion exec next build` → SUCCEEDS w/o DB | Delete `apps/gestion/` |
| 3 (dashboard) | gestion tests → 5 passed | next build routes render statically w/o DB | Remove `page.tsx`/`dashboard-content.tsx` only |
| 4 (clients reads) | gestion tests → 11 passed | next build `/clients` static, `/[id]` dynamic ƒ | Remove table + read pages |
| 5 (clients writes) | gestion tests → 19 passed | next build succeeds; actions tested via mocked data | Revert actions+form+confirm-dialog |
| 6 (wiring) | root `pnpm test` → 8 tasks pass | root `pnpm build` (turbo) → 5 tasks pass | Trivial; no feature revert |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/contracts/src/client.ts` | Modified | Add `active: z.boolean()` to clientSchema |
| `packages/contracts/src/client.test.ts` | Modified | Tests for `active` field (3 new) |
| `packages/data/prisma/schema.prisma` | Modified | Add `active Boolean @default(true)` to GestionClient |
| `packages/data/src/mapper/client.ts` | Modified | Include `active` in contract mapping |
| `packages/data/src/mapper/client.test.ts` | Modified | Mapper `active` tests (2 new) |
| `packages/data/src/access/client.ts` | Modified | Filter listClients, add softDeleteClient, gate upsert on active |
| `packages/data/src/access/client.test.ts` | Modified | Access `active` + softDelete tests |
| `packages/data/src/index.ts` | Modified | Export `softDeleteClient` |
| `apps/gestion/*` (23 files) | Created | Full admin app scaffold (Scaffold PR work unit 2) |
| `apps/gestion/app/(admin)/page.tsx`, `dashboard-content.tsx` | Created | Dashboard (work unit 3) |
| `apps/gestion/components/client-table.tsx`, clients pages | Created | Clients reads (work unit 4) |
| `apps/gestion/lib/actions/client.ts`, `client-form.tsx`, `confirm-dialog.tsx`, `delete-client-button.tsx` | Created | Clients writes (work unit 5) |
| `apps/gestion/not-found.tsx`, `sidebar.tsx` | Modified | Link for internal navigation (build fix) |

## Validation Output

- `pnpm install` — OK (no new allowBuilds needed; next 15 + eslint flat config)
- `pnpm --filter @beim/data exec prisma generate` — OK
- `pnpm --filter @beim/data exec vitest run` — ALL GREEN (105 tests)
- `pnpm --filter @beim/contracts exec vitest run` — ALL GREEN (65 tests)
- `pnpm --filter @beim/data exec tsc --noEmit` — exit 0
- `pnpm --filter @beim/contracts exec tsc --noEmit` — exit 0
- `pnpm --filter @beim/gestion exec tsc --noEmit` — exit 0
- `pnpm --filter @beim/gestion exec vitest run` — ALL GREEN (19 tests)
- `pnpm --filter @beim/gestion exec next build` — SUCCEEDS without live DB
- `pnpm dlx turbo run build` — 5/5 successful
- `pnpm typecheck` — 8/8 successful
- `pnpm test` — 8/8 successful
- `pnpm lint` — 5/5 successful

## Commits (7 on feat/gestion, no pushes)

| Hash | Message | Work Unit |
|------|---------|-----------|
| `d347723` | `feat(data): add soft-delete support for GestionClient` | 1 |
| `d804e24` | `feat(gestion): scaffold admin app with shell layout and auth placeholder` | 2 |
| `7619821` | `feat(gestion): add dashboard with metrics from @beim/data` | 3 |
| `57e7d04` | `feat(gestion): add clients list with search and detail view` | 4 |
| `a970bca` | `feat(gestion): add client create/edit form and soft-delete actions` | 5 |
| `83b7375` | `fix(gestion): use Link for internal navigation to pass build lint` | 6 |
| `57e7792` | `chore(gestion): add next-env types and mark all tasks complete` | — |

## Deviations from Design

1. **Server Actions validate name only, not full `clientSchema`**: The design shows Server Actions validating against `@beim/contracts` Client schema. However, the Client schema requires `id`, `createdAt`, `updatedAt`, and `active` — fields the form/action never receives (server generates them). Validating against `clientSchema` would always fail. Instead, the actions validate the required `name` field (matching the spec scenario "Reject invalid client" which tests missing name) and pass optional fields to `upsertClient`. This is the correct interpretation — full `clientSchema` is for reading, not for form payload validation.
2. **Auth login simplified**: The design says login posts to `/api/gestion/management-login`. No such API route exists in this slice and the design marks auth as placeholder/deferred. The `login()` in auth-context uses a mock that sets the session directly (marked TODO for real auth). This matches "Auth shell = placeholder" intent.
3. **Strict TDD applied to data-layer RED/GREEN tasks; app component tasks followed standard workflow with tests-first for behaviors** — per the orchestrator's instruction "test-first for contracts/mapper/access + form/action validators".

## Issues Found

1. **`exactOptionalPropertyTypes` in actions**: Building an object literal with `document: string | undefined` fails typecheck under `exactOptionalPropertyTypes`. Fixed by conditionally assigning optional fields.
2. **`next build` runs ESLint by default** and flags `<a>` for internal navigation. Fixed by using `next/link` `Link` components in `not-found.tsx` and `sidebar.tsx`.

## Remaining Tasks

None — all 33 tasks complete.

## Next Recommended

`sdd-verify`
