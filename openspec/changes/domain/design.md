# Design: Domain Package

## Technical Approach

Port business logic from legacy `pagina-web/server.js` and `sistema-gestion/app.js` into `@beim/domain` — a pure TypeScript package exporting domain use cases. Follow hexagonal/clean architecture: domain core depends only on `@beim/contracts` types, with zero infrastructure imports. All functions are pure, accepting contract types and returning results or throwing `DomainError`. Tests use Vitest with strict TDD (RED→GREEN→REFACTOR). Maps to proposal approach; specs `domain-order`, `domain-payment`, `domain-stock`, `domain-client`, `domain-package` are source of truth.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Package layout | Flat single file vs `src/` per-area modules + `index.ts` barrel | Flat: one giant file, poor imports. Per-area: matches proposal structure, co-located tests, clean public surface. | **Per-area modules** (`order/`, `payment/`, `stock/`, `client/`, each with `index.ts` + modules + tests) |
| Error handling | Union type vs class vs branded error | Union: lightweight, pattern matching. Class: instanceof checks, stack traces. Branded: nominal typing. | **`DomainError` class** extending `Error` with `code` field for machine-readable error identification |
| Return semantics | Throw on error vs `Result<T, E>` | Throw: simple, familiar. Result: explicit error handling, no surprises. | **Throw `DomainError`** — matches legacy pattern (assert/throw), simpler for pure functions |
| Status machine | Transition map object vs guard functions vs state pattern | Map: declarative, easy to extend. Guard: imperative, flexible. State: OOP, heavy. | **Explicit transition map** with guard functions for complex rules |
| Payment vocabularies | Single normalized vocabulary vs dual | Single: simpler, but loses legacy context. Dual: preserves both, but adds complexity. | **Single normalized vocabulary** — `Sin abonar|Seña|Pagado` (gestion), map web's `Pendiente de pago|Parcial|Pagado` at boundary |
| Stock computation | Pure functions vs methods on state objects | Pure: testable, composable. Methods: encapsulated, but harder to mock. | **Pure functions** taking stock state + movement parameters |
| Money handling | Plain numbers vs branded `Money` type | Plain: simple, matches contracts. Branded: type safety, prevents mixing. | **Plain numbers** — matches contracts `z.number()`, defer branded type to `data` phase |
| Module exports | Barrel per area + package index vs direct imports | Barrels: clean imports, but can hide dependencies. Direct: explicit, but verbose. | **Barrel per area + package index** — `@beim/domain/order`, `@beim/domain/payment`, etc., plus root barrel |
| Test structure | Co-located `*.test.ts` vs separate `__tests__/` directory | Co-located: easy to find, matches contracts pattern. Separate: clean src, but split attention. | **Co-located `*.test.ts`** — matches contracts pattern, spec requirement |
| Dependency boundary | Enforce via tsconfig vs ESLint vs convention | tsconfig: compile-time, strict. ESLint: lint-time, flexible. Convention: manual discipline. | **tsconfig `paths` alias** + ESLint rule (when available) + PR review |

## Data Flow

```
Consumer (data/apps) → @beim/domain barrel → domain modules
    │
    └── @beim/contracts (types only, no runtime)
```

Domain functions:
```
Input (contract types) → Pure function → Output (contract types | DomainError)
```

Stock flow:
```
Stock state (Product.stock) + movement params → computeBalanceAfter → StockMovement
```

Status machine:
```
Current status + transition request → validateTransition → new status | DomainError
```

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/domain/package.json` | Create | `@beim/domain`, private, `@beim/contracts` workspace dependency |
| `packages/domain/tsconfig.json` | Create | Extends `@beim/tsconfig/base.json`, ultra-strict |
| `packages/domain/vitest.config.ts` | Create | Vitest config, coverage, `src` environment |
| `packages/domain/src/index.ts` | Create | Barrel re-exports all domain modules |
| `packages/domain/src/domain-error.ts` | Create | `DomainError` class with code field |
| `packages/domain/src/order/index.ts` | Create | Order module barrel |
| `packages/domain/src/order/calculation.ts` | Create | `serviceItemsTotal`, `technicalBaseBudget`, `orderBudgetBreakdown` |
| `packages/domain/src/order/calculation.test.ts` | Create | TDD tests for calculations |
| `packages/domain/src/order/status.ts` | Create | `validateOrderStatus`, `isFinishedOrderStatus`, `applyFinishedTimestamp`, `deriveRepairStatusFromServiceItems` |
| `packages/domain/src/order/status.test.ts` | Create | TDD tests for status transitions |
| `packages/domain/src/order/service-items.ts` | Create | `normalizeServiceItems`, `normalizeServiceItemApprovalStatus`, `findDuplicateServiceItemDescriptions`, `commitApprovedServiceItemStockLocally`, `restoreRemovedServiceItemStockLocally` |
| `packages/domain/src/order/service-items.test.ts` | Create | TDD tests for service items |
| `packages/domain/src/payment/index.ts` | Create | Payment module barrel |
| `packages/domain/src/payment/annulment.ts` | Create | `processAnnulment`, `validateAnnulmentReason`, `checkDuplicateAnnulment`, `restoreStockOnAnnulment` |
| `packages/domain/src/payment/annulment.test.ts` | Create | TDD tests for annulment |
| `packages/domain/src/payment/status.ts` | Create | `updatePaymentStatus`, `validateStockCommitmentGuard`, `deductStockOnPaidStatus` |
| `packages/domain/src/payment/status.test.ts` | Create | TDD tests for payment status |
| `packages/domain/src/stock/index.ts` | Create | Stock module barrel |
| `packages/domain/src/stock/validation.ts` | Create | `validateStockSufficiency`, `checkMinStockThreshold` |
| `packages/domain/src/stock/validation.test.ts` | Create | TDD tests for stock validation |
| `packages/domain/src/stock/movement.ts` | Create | `computeBalanceAfter`, `createStockMovement` |
| `packages/domain/src/stock/movement.test.ts` | Create | TDD tests for movement computation |
| `packages/domain/src/stock/purchase.ts` | Create | `computeWeightedAverageCost`, `validatePurchase`, `processPurchaseAnnulment` |
| `packages/domain/src/stock/purchase.test.ts` | Create | TDD tests for purchase logic |
| `packages/domain/src/stock/transfer.ts` | Create | `validateTransferSource`, `generatePairedTransferMovements`, `deriveDestinationId` |
| `packages/domain/src/stock/transfer.test.ts` | Create | TDD tests for transfer logic |
| `packages/domain/src/client/index.ts` | Create | Client module barrel |
| `packages/domain/src/client/validation.ts` | Create | `validateClientName`, `resolveDefaultClient`, `normalizeDocument`, `applyClientDefaults` |
| `packages/domain/src/client/validation.test.ts` | Create | TDD tests for client validation |
| `pnpm-workspace.yaml` | Modify | Add `packages/domain` to workspaces (already via `packages/*`) |
| `turbo.json` | Modify | Domain auto-discovered via scripts; no changes needed |

## Interfaces / Contracts

```typescript
// domain-error.ts
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

// Error codes (examples)
export const ErrorCodes = {
  INVALID_STATUS: 'INVALID_STATUS',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  STOCK_COMMITTED: 'STOCK_COMMITTED',
  ANNULMENT_REASON_REQUIRED: 'ANNULMENT_REASON_REQUIRED',
  DUPLICATE_ANNULMENT: 'DUPLICATE_ANNULMENT',
  INVALID_TRANSFER_SOURCE: 'INVALID_TRANSFER_SOURCE',
  CLIENT_NAME_REQUIRED: 'CLIENT_NAME_REQUIRED',
  INVALID_PURCHASE: 'INVALID_PURCHASE',
} as const;

// Status transition map
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  Pendiente: ['Pagado', 'Cancelado'],
  Pagado: ['Enviado', 'Cancelado'],
  Enviado: ['Entregado', 'Cancelado'],
  Entregado: ['Finalizado'],
  Cancelado: [],
};

// Payment status normalization
export function normalizePaymentStatus(status: string): PaymentStatus {
  // Maps web vocabulary to gestion vocabulary
}

// Stock computation
export function computeBalanceAfter(
  previousBalance: number,
  quantity: number,
): number {
  return previousBalance + quantity;
}

export function computeWeightedAverageCost(
  oldStock: number,
  oldCost: number,
  newQty: number,
  newCost: number,
): number {
  if (oldStock + newQty === 0) return newCost;
  return ((oldStock * oldCost) + (newQty * newCost)) / (oldStock + newQty);
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Each domain function in isolation | RED-GREEN-REFACTOR; co-located `*.test.ts` |
| Unit | Edge cases (empty inputs, zero values, boundary conditions) | Property-based testing with Vitest |
| Unit | Error conditions (DomainError codes, messages) | Assert error type and code |
| Unit | Status transitions (valid/invalid) | Transition map validation |
| Unit | Stock computations (balanceAfter, WAC) | Pure function assertions |
| Integration | Package builds and typechecks | `pnpm --filter @beim/domain typecheck` |
| Integration | All tests pass | `pnpm --filter @beim/domain test` |
| E2E | N/A (pure domain, no UI) | Deferred to app layer |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No data migration required — additive private package with no consumers yet. Rollback: remove `packages/domain/`, revert workspace changes.

## Open Questions

- [ ] Confirm `DomainError` code values match legacy error messages for backward compatibility?
- [ ] Should `normalizePaymentStatus` map web's `Pendiente de pago` to gestion's `Sin abonar`, or keep both vocabularies separate?
- [ ] How to handle `finishedAt` timestamp generation in pure functions? (Current: `new Date().toISOString()` — impure)
- [ ] Should `commitApprovedServiceItemStockLocally` and `restoreRemovedServiceItemStockLocally` be pure functions taking state, or methods on mutable state objects?
