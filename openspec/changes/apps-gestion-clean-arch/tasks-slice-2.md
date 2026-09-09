# Tasks: Slice-2 Ordenes Server Vertical + Hooks

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 320–380 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single child PR |
| Delivery strategy | feature-branch-chain child |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Port + adapter + tests | Child PR c1 | `test -- json-orden-repository` | N/A (Vitest) | Delete port + adapter + tests |
| 2 | Use-cases + controller | Child PR c2 | `test -- orden-use-cases orden-controller` | N/A (Vitest) | Delete use-case + controller + tests |
| 3 | Composition + rewiring | Child PR c3 | `typecheck` | `dev`, visit `/app/ordenes` | Delete composition; revert pages |
| 4 | Hooks + regression + gates | Child PR c4 | `test -- useOrders useOrderDetail useCreateOrder` | N/A (jsdom + fetch mock) | Delete three hooks + tests |

Test prefix: `pnpm --filter @beim/gestion` from worktree cwd.

## Phase 1: Port + adapter + contract tests

- [x] 1.1 Create `apps/gestion/src/server/ordenes/orden-port.ts` (port `list`/`getById`/`create` on kernel `Result`/`GestionError`; frozen types from `apps/gestion/src/server/ordenes/orders-handler.ts` (read-only); const-types, no `any`). Test: `test -- orden-port`. Accept: compiles; zero `src/kernel/**` edits. Rollback: delete file.
- [x] 1.2 Create `apps/gestion/src/server/ordenes/json-orden-repository.ts` + `apps/gestion/src/server/ordenes/json-orden-repository.test.ts` (sole `JsonStore` importer; seed-dir round-trip matches frozen envelopes; corrupt JSON → `err(STORAGE_ERROR)`, never throws; `apps/gestion/src/server/data/schemas.ts` (read-only)). Test: `test -- json-orden-repository`. Accept: round-trip + corrupt green. Rollback: delete both.

## Phase 2: Use-cases + controller

- [x] 2.1 Create `apps/gestion/src/server/ordenes/orden-use-cases.ts` + `apps/gestion/src/server/ordenes/orden-use-cases.test.ts` (pure, port-only; `ORDER_CREATE_ROLES` preserved; stub delegates identical envelope/code; unauthorized → frozen error). Test: `test -- orden-use-cases`. Accept: delegate + denied green. Rollback: delete both.
- [x] 2.2 Create `apps/gestion/src/server/ordenes/orden-controller.ts` + `apps/gestion/src/server/ordenes/orden-controller.test.ts` (zod boundary on frozen schemas (read-only); `GestionError`→HTTP map; invalid payload → frozen status, use-case skipped). Test: `test -- orden-controller`. Accept: invalid + mapping green. Rollback: delete both.

## Phase 3: Composition binding + page rewiring

- [x] 3.1 Create `apps/gestion/src/server/composition/ordenes.composition.ts` (sole `new JsonOrdenRepository(dir)` + factories; `orders-handler.ts` (read-only) frozen). Test: `test -- ordenes.composition`. Accept: port→use-case→controller wired. Rollback: delete file, re-point to `OrderHandler`.
- [x] 3.2 Rewire `apps/gestion/app/app/ordenes/**`, `apps/gestion/app/**/nueva/**` (imports only; `apps/gestion/src/server/pages/new-order-view.ts` (read-only), `apps/gestion/src/components/features/NewOrderFrame.tsx` (read-only), `apps/gestion/src/components/features/ordenes/useOrdenMutations.ts` (read-only) untouched; `nextNumber`/`ORDEN_CREADA` documented-only). Test: `typecheck`. Accept: zero page→`server/ordenes|server/handlers`. Rollback: revert pages.

## Phase 4: Hooks + stale-list regression + grep gates

- [x] 4.1 Create `apps/gestion/src/hooks/useOrders.ts`, `apps/gestion/src/hooks/useOrderDetail.ts`, `apps/gestion/src/hooks/useCreateOrder.ts` + hook tests (each owns key factory + parse, no shared helper; `['ordenes','list',params]` 30s stale; `['ordenes','detail',id]` `enabled: !!id`; create `onSettled` invalidates `['ordenes']`; `useOrdenMutations.ts` (read-only) unchanged). Test: `test -- useOrders useOrderDetail useCreateOrder`. Accept: keys + typed parse/network split green. Rollback: delete hooks + tests.
- [x] 4.2 Add stale-list regression + run grep gates (N-item list refetches N+1 after settle; stale detail refetches; gates: zero page→`server/ordenes|server/handlers`, zero `JsonStore|fetch` outside `adapters/`+`composition/`+`ordenes/`, per-hook ownership). Test: full `test` + `rg` checklist. Accept: suite + greps green. Rollback: delete regression test.
