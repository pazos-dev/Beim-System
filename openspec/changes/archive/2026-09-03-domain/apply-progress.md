# Apply Progress: Domain Package

**Status**: success
**Mode**: Strict TDD
**Date**: 2026-09-03
**Branch**: feat/domain
**Delivery**: auto-chain, stacked-to-main (commits local, no push)

## Summary

Implemented the complete `@beim/domain` package across 6 work units (PR-sliced):
bootstrap + DomainError, order calculation, order status + service items,
payment (status + annulment), stock (validation/movement/purchase/transfer),
and client validation + root barrel. All 39 tasks complete; 11 test files with
144 tests all GREEN; typecheck, build, and root turbo build/typecheck clean.

## Commits

| Commit | Work Unit | Description |
|--------|-----------|-------------|
| `2487d0f` | 1 | feat(domain): bootstrap @beim/domain package with DomainError |
| `234bfbf` | 2 | feat(domain): add order service-item total and technical base budget calculation |
| `32fa11e` | 3 | feat(domain): add order status transitions and service-item normalization |
| `144e561` | 4 | feat(domain): add payment status normalization and annulment processing |
| `d7e9e38` | 5 | feat(domain): add stock validation, movement, purchase, and transfer logic |
| `9697694` | 6 | feat(domain): add client validation and root barrel re-exports |
| `7acbb79` | — | docs(domain): mark all implementation tasks complete in apply |

## Validation Output

| Gate | Command | Result |
|------|---------|--------|
| Install | `pnpm install --frozen-lockfile` | Already up to date (exit 0) |
| Domain tests | `pnpm --filter @beim/domain exec vitest run` | 11 files, 144 tests, 144 passed |
| Domain typecheck | `pnpm --filter @beim/domain exec tsc --noEmit` | Exit 0 |
| Domain build | `pnpm --filter @beim/domain build` | Exit 0 |
| Root turbo build | `pnpm dlx turbo run build` | 2 tasks successful |
| Root typecheck | `pnpm typecheck` | 3 tasks successful |

## Files Changed (this apply batch)

| File | Action | What Was Done |
|------|--------|---------------|
| `packages/domain/src/order/status.ts` | Created | validateOrderStatus, isFinishedOrderStatus, applyFinishedTimestamp, deriveRepairStatusFromServiceItems |
| `packages/domain/src/order/status.test.ts` | Created | 21 tests: status validation, finished detection, timestamps, repair derivation |
| `packages/domain/src/order/service-items.ts` | Created | normalizeServiceItems, normalizeServiceItemApprovalStatus, findDuplicateServiceItemDescriptions, commitApprovedServiceItemStockLocally, restoreRemovedServiceItemStockLocally |
| `packages/domain/src/order/service-items.test.ts` | Created | 24 tests: filtering, coercion, approval mapping, duplicates, local stock commit/restore |
| `packages/domain/src/order/index.ts` | Created | Order barrel re-exports |
| `packages/domain/src/payment/status.ts` | Created | normalizePaymentStatus, validateStockCommitmentGuard, computeStockDeductions, mapWebPaymentStatus |
| `packages/domain/src/payment/status.test.ts` | Created | 18 tests: payment normalization, stock commitment guard, deductions, web mapping |
| `packages/domain/src/payment/annulment.ts` | Created | validateAnnulmentReason, checkDuplicateAnnulment, processAnnulment |
| `packages/domain/src/payment/annulment.test.ts` | Created | 13 tests: reason validation, duplicate detection, stock restoration |
| `packages/domain/src/payment/index.ts` | Created | Payment barrel re-exports |
| `packages/domain/src/stock/validation.ts` | Created | validateStockSufficiency, checkMinStockThreshold |
| `packages/domain/src/stock/validation.test.ts` | Created | 8 tests: sufficiency, min threshold |
| `packages/domain/src/stock/movement.ts` | Created | computeBalanceAfter, createStockMovement |
| `packages/domain/src/stock/movement.test.ts` | Created | 6 tests: sale, purchase, typed movement shape |
| `packages/domain/src/stock/purchase.ts` | Created | computeWeightedAverageCost, validatePurchase, validatePurchaseAnnulment |
| `packages/domain/src/stock/purchase.test.ts` | Created | 18 tests: WAC math, purchase validation, annulment guard |
| `packages/domain/src/stock/transfer.ts` | Created | validateTransferSource, generatePairedTransferMovements, deriveDestinationId |
| `packages/domain/src/stock/transfer.test.ts` | Created | 12 tests: source guard, paired movements, destination ID |
| `packages/domain/src/stock/index.ts` | Created | Stock barrel re-exports |
| `packages/domain/src/client/validation.ts` | Created | validateClientName, resolveDefaultClient, normalizeDocument, applyClientDefaults |
| `packages/domain/src/client/validation.test.ts` | Created | 16 tests: name validation, default client, document normalization, field defaults |
| `packages/domain/src/client/index.ts` | Created | Client barrel re-exports |
| `packages/domain/src/index.ts` | Created | Root barrel re-exports (DomainError + all areas) |
| `.gitignore` | Modified | Added `*.tsbuildinfo` |
| `openspec/changes/domain/tasks.md` | Modified | Marked all 39 tasks `[x]` |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1-3.2 | `src/order/status.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (21) | ✅ 5+ cases/behavior | ✅ Clean |
| 3.3-3.4 | `src/order/service-items.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (24) | ✅ 5+ cases/behavior | ✅ Clean |
| 4.1-4.2 | `src/payment/status.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (18) | ✅ 4+ cases/behavior | ✅ Clean |
| 4.3-4.4 | `src/payment/annulment.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (13) | ✅ 6+ cases/behavior | ✅ Clean |
| 5.1-5.2 | `src/stock/validation.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (8) | ✅ 8 cases | ✅ Clean |
| 5.3-5.4 | `src/stock/movement.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (6) | ✅ 6 cases | ✅ Clean |
| 5.5-5.6 | `src/stock/purchase.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (18) | ✅ 18 cases | ✅ Clean |
| 5.7-5.8 | `src/stock/transfer.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (12) | ✅ 12 cases | ✅ Clean |
| 6.1-6.2 | `src/client/validation.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (16) | ✅ 16 cases | ✅ Clean |

Note: For this batch, Safety Net = N/A (new) because all files were created
fresh (no pre-existing code to protect). Existing baseline (domain-error.ts +
order/calculation.ts from prior commits) was verified as still passing (8/8).

Tasks 1.1-2.3 (bootstrap + DomainError + calculation) were completed in prior
commits `2487d0f` and `234bfbf` (verified working before this batch).
Their TDD evidence was captured in their original commits and is unchanged.

## Test Summary

- **Total test files**: 11
- **Total tests written**: 144
- **Total tests passing**: 144
- **Layers used**: Unit (144)
- **Approval tests**: None (no refactoring tasks)
- **Pure functions created**: 48

## Work Unit Evidence

### Work Unit 3 (Order Status + Service Items)
| Evidence | Value |
|----------|-------|
| Focused test command | `pnpm --filter @beim/domain exec vitest run src/order/` → 3 files, 49 tests, all pass |
| Runtime harness | N/A — pure functions, no runtime boundary |
| Rollback boundary | `src/order/status.ts`, `src/order/service-items.ts`, `src/order/index.ts` + tests (revert without affecting other modules) |

### Work Unit 4 (Payment)
| Evidence | Value |
|----------|-------|
| Focused test command | `pnpm --filter @beim/domain exec vitest run src/payment/` → 2 files, 31 tests, all pass |
| Runtime harness | N/A — pure functions, no runtime boundary |
| Rollback boundary | `src/payment/` entire module (revert cleanly) |

### Work Unit 5 (Stock)
| Evidence | Value |
|----------|-------|
| Focused test command | `pnpm --filter @beim/domain exec vitest run src/stock/` → 4 files, 44 tests, all pass |
| Runtime harness | N/A — pure functions, no runtime boundary |
| Rollback boundary | `src/stock/` entire module (revert cleanly) |

### Work Unit 6 (Client + Barrel)
| Evidence | Value |
|----------|-------|
| Focused test command | `pnpm --filter @beim/domain exec vitest run src/client/` → 1 file, 16 tests, all pass |
| Runtime harness | `pnpm --filter @beim/domain build` → exit 0 |
| Rollback boundary | `src/client/`, `src/index.ts`, barrel re-exports (revert without removing module logic) |

## Deviations from Design

1. **Transfer reference ID generation**: The design's function signature is
   `generatePairedTransferMovements(sourceId, quantity, now)` but the legacy
   uses a crypto UUID for `transiferId`. I made the reference ID derive from
   the injected `now` when available, falling back to a pure source+quantity
   key. This keeps the function pure (no `crypto.randomUUID()`/`Date.now()` in
   domain).
2. **`createStockMovement` return type**: Design says "returns typed
   StockMovement shape". The contracts `StockMovement` requires `id` and
   `createdAt` (DB-assigned). The pure function returns `StockMovementInput`
   without those identity fields; the data layer assigns them at write time.
3. **`balanceAfter` in transfer movements**: Set to `0` as a placeholder; the
   data layer must compute the actual balance from real stock state after the
   DB update (matching legacy behavior where balanceAfter comes from the
   `returning *` row).

## Issues Found

1. **Ultra-strict `exactOptionalPropertyTypes` in tests**: Setting a property
   to `undefined` (e.g. `{ ...valid, productId: undefined }`) fails under
   `exactOptionalPropertyTypes`. Fixed by destructuring the key out instead.
2. **Index signature property access (`noPropertyAccessFromIndexSignature`)**:
   Required switching from `raw.price` to explicit typed fields in
   `normalizeServiceItems`. Resolved by defining a `RawServiceItem` interface
   instead of using generic object access.

## Workload / PR Boundary
- Mode: chained PR slice (auto-chain, stacked-to-main)
- Current work unit: 6 (final) — all work units complete
- Boundary: full domain package implementation from bootstrap through client
- Estimated review budget impact: each work unit commit is autonomous and
  independently reviewable (~200-400 lines each)

## Status

39/39 tasks complete. Ready for verify.
