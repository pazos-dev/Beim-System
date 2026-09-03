# Tasks: Domain Package

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1500–1800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Package bootstrap + DomainError | PR 1 | `pnpm --filter @beim/domain test` | `pnpm --filter @beim/domain typecheck` | `packages/domain/` (new, clean revert) |
| 2 | Order calculation module | PR 2 | `pnpm --filter @beim/domain exec vitest run src/order/calculation` | N/A — pure functions, no runtime boundary | `src/order/calculation.ts` + `.test.ts` |
| 3 | Order status + service-items modules | PR 3 | `pnpm --filter @beim/domain exec vitest run src/order/` | N/A — pure functions | `src/order/status.ts`, `src/order/service-items.ts` + tests, `src/order/index.ts` |
| 4 | Payment domain (status + annulment) | PR 4 | `pnpm --filter @beim/domain exec vitest run src/payment/` | N/A — pure functions | `src/payment/` entire module |
| 5 | Stock domain (validation, movement, purchase, transfer) | PR 5 | `pnpm --filter @beim/domain exec vitest run src/stock/` | N/A — pure functions | `src/stock/` entire module |
| 6 | Client domain + barrel + full verification | PR 6 | `pnpm --filter @beim/domain test && pnpm --filter @beim/domain typecheck` | `pnpm --filter @beim/domain build` | `src/client/`, `src/index.ts`, barrel re-exports |

## Phase 1: Package Bootstrap

- [x] 1.1 Create `packages/domain/package.json` — `@beim/domain`, private, `"type":"module"`, deps: `@beim/contracts "workspace:*"`, devDeps: `vitest ^3.2.0`, `@vitest/coverage-v8 ^3.2.0`, `@beim/tsconfig "workspace:*"`, `typescript ^5.6.3`, scripts: `build`, `typecheck`, `test` (mirror contracts)
- [x] 1.2 Create `packages/domain/tsconfig.json` — extends `@beim/tsconfig/base.json`, rootDir: `src`, outDir: `dist`, declaration, declarationMap, sourceMap, incremental
- [x] 1.3 Create `packages/domain/vitest.config.ts` — environment: `node`, include: `src/**/*.test.ts`, v8 coverage (mirror contracts)
- [x] 1.4 Create `packages/domain/src/domain-error.ts` — `DomainError` class extending Error with `code: string` field; `ErrorCodes` const object (INVALID_STATUS, INSUFFICIENT_STOCK, STOCK_COMMITTED, ANNULMENT_REASON_REQUIRED, DUPLICATE_ANNULMENT, INVALID_TRANSFER_SOURCE, CLIENT_NAME_REQUIRED, INVALID_PURCHASE)
- [x] 1.5 RED: Write `packages/domain/src/domain-error.test.ts` — test DomainError instantiates with code + message, `instanceof Error` is true, name is `"DomainError"`
- [x] 1.6 GREEN + REFACTOR: implement DomainError, verify test passes, clean up

## Phase 2: Order — Calculation

- [x] 2.1 RED: Write `packages/domain/src/order/calculation.test.ts` — scenarios: sum prices, empty items → 0, technicalBaseBudget subtracts added totals, floor at zero, budget breakdown
- [x] 2.2 GREEN: Create `packages/domain/src/order/calculation.ts` — `serviceItemsTotal(items)`: sum `unitPrice * quantity`; `technicalBaseBudget(budget, items)`: `max(budget - serviceItemsTotal(items), 0)`
- [x] 2.3 REFACTOR: simplify calculation logic, add JSDoc, verify tests pass

## Phase 3: Order — Status & Service Items

- [x] 3.1 RED: Write `packages/domain/src/order/status.test.ts` — scenarios: validate valid/invalid statuses, finished detection (Finalizado/Entregado/Cancelado), finishedAt set/clear via `now` param, repair status derivation (empty→Presupuestado, has Pendiente→Esperando aprobacion, has Aprobado→Aprobado)
- [x] 3.2 GREEN: Create `packages/domain/src/order/status.ts` — `validateOrderStatus(status)`, `isFinishedOrderStatus(status)`, `applyFinishedTimestamp(order, newStatus, now)`: sets ISO string when entering finished, clears to `""` when leaving, `deriveRepairStatusFromServiceItems(items)`
- [x] 3.3 RED: Write `packages/domain/src/order/service-items.test.ts` — scenarios: filter source:"initial", case-insensitive approval mapping, coerce string→number, duplicate detection, commit stock locally (pure: takes stock map + items, returns new map), restore stock locally
- [x] 3.4 GREEN: Create `packages/domain/src/order/service-items.ts` — `normalizeServiceItems(items)`, `normalizeServiceItemApprovalStatus(status)`, `findDuplicateServiceItemDescriptions(items)`, `commitApprovedServiceItemStockLocally(stockMap, items)`, `restoreRemovedServiceItemStockLocally(stockMap, items)` — all pure functions
- [x] 3.5 Create `packages/domain/src/order/index.ts` — barrel re-exports from calculation, status, service-items
- [x] 3.6 Verify: `pnpm --filter @beim/domain exec vitest run src/order/` — all order tests GREEN

## Phase 4: Payment Domain

- [x] 4.1 RED: Write `packages/domain/src/payment/status.test.ts` — scenarios: normalize Pagado→Pagado, Parcial→Seña, empty→Sin abonar; stock commitment guard (stockCommitted=true blocks revert); stock deduction on Pagado when not committed
- [x] 4.2 GREEN: Create `packages/domain/src/payment/status.ts` — `normalizePaymentStatus(status)` (gestion vocabulary), `validateStockCommitmentGuard(currentStatus, targetStatus, stockCommitted)`, `computeStockDeductions(items)`: returns deduction array; `mapWebPaymentStatus(status)`: maps Pendiente de pago→Sin abonar, Parcial→Seña at boundary
- [x] 4.3 RED: Write `packages/domain/src/payment/annulment.test.ts` — scenarios: empty reason rejected, duplicate detected (stockRestoredAt + financialReversedAt both set), first annulment processes, stock restored per item, skips invalid items (empty productId or zero qty)
- [x] 4.4 GREEN: Create `packages/domain/src/payment/annulment.ts` — `validateAnnulmentReason(reason)`, `checkDuplicateAnnulment(receipt)`: returns `{duplicate: boolean}`, `processAnnulment(receipt, items)`: returns `{stockRestorations, financialReversal, duplicate}`
- [x] 4.5 Create `packages/domain/src/payment/index.ts` — barrel re-exports from status, annulment
- [x] 4.6 Verify: `pnpm --filter @beim/domain exec vitest run src/payment/` — all payment tests GREEN

## Phase 5: Stock Domain

- [x] 5.1 RED: Write `packages/domain/src/stock/validation.test.ts` — scenarios: sufficient/insufficient stock, below/above minStock threshold
- [x] 5.2 GREEN: Create `packages/domain/src/stock/validation.ts` — `validateStockSufficiency(stock, requested)`, `checkMinStockThreshold(stock, minStock)`: returns `{belowMin: boolean}`
- [x] 5.3 RED: Write `packages/domain/src/stock/movement.test.ts` — scenarios: sale (10 + (-3) = 7), purchase (5 + 10 = 15)
- [x] 5.4 GREEN: Create `packages/domain/src/stock/movement.ts` — `computeBalanceAfter(previousBalance, quantity)`, `createStockMovement(params)`: returns typed StockMovement shape
- [x] 5.5 RED: Write `packages/domain/src/stock/purchase.test.ts` — scenarios: WAC with positive stock (≈106.67), WAC from zero stock (120), valid purchase passes, missing field rejected, invalid quantity rejected
- [x] 5.6 GREEN: Create `packages/domain/src/stock/purchase.ts` — `computeWeightedAverageCost(oldStock, oldCost, newQty, newCost)`, `validatePurchase(purchase)`, `validatePurchaseAnnulment(currentStock, purchaseQuantity)`
- [x] 5.7 RED: Write `packages/domain/src/stock/transfer.test.ts` — scenarios: web product allowed, workshop product rejected, paired movements (web_transfer_out + web_transfer_in), destination ID derivation (`workshop-web-{sourceId}`)
- [x] 5.8 GREEN: Create `packages/domain/src/stock/transfer.ts` — `validateTransferSource(product)`, `generatePairedTransferMovements(sourceId, quantity, now)`, `deriveDestinationId(sourceId)`
- [x] 5.9 Create `packages/domain/src/stock/index.ts` — barrel re-exports from validation, movement, purchase, transfer
- [x] 5.10 Verify: `pnpm --filter @beim/domain exec vitest run src/stock/` — all stock tests GREEN

## Phase 6: Client Domain + Barrel + Final Verification

- [x] 6.1 RED: Write `packages/domain/src/client/validation.test.ts` — scenarios: valid name passes, empty/whitespace name rejected, default client "Cliente Mostrador", document trim and empty→"-", phone default "-", email default ""
- [x] 6.2 GREEN: Create `packages/domain/src/client/validation.ts` — `validateClientName(name)`, `resolveDefaultClient(client)`, `normalizeDocument(doc)`, `applyClientDefaults(client)`
- [x] 6.3 Create `packages/domain/src/client/index.ts` — barrel re-export from validation
- [x] 6.4 Create `packages/domain/src/index.ts` — root barrel re-exporting all modules: domain-error, order, payment, stock, client
- [x] 6.5 Run `pnpm install` from repo root — verify domain workspace resolves
- [x] 6.6 Run `pnpm --filter @beim/domain typecheck` — zero type errors under ultra-strict
- [x] 6.7 Run `pnpm --filter @beim/domain test` — ALL tests GREEN
- [x] 6.8 Run `pnpm --filter @beim/domain build` — dist output generated successfully
