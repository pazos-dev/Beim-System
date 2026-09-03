# Proposal: Domain Package

## Intent

Port the scattered business logic from `pagina-web/server.js` and `sistema-gestion/app.js` into `@beim/domain` — a pure TypeScript package containing use cases and domain services. The legacy codebase mixes DB queries, HTTP, and business rules in 4500+ line files, making rules untestable, unshareable, and fragile. Extracting them into a hexagonal domain core (depending only on `@beim/contracts` types) makes business rules testable in isolation and reusable across the web storefront, gestion admin panel, and future apps.

## Scope

### In Scope
- `packages/domain/` bootstrap: package.json, tsconfig, vitest config (follows contracts pattern)
- Core domain modules extracted from legacy business logic
- Strict TDD with co-located tests
- All money handling in plain numbers (matching contracts `z.number()`)

### Out of Scope
- Persistence/infra layer (`packages/data`) — port domain calls to data layer later
- HTTP/API routes, auth, audit logging, Stripe integration
- UI concerns, state management, formatting
- Service order workflow (managed separately)

## Capabilities

### New Capabilities
- `domain-order`: Order total calculation, budget breakdown, service items normalization, order status state machine
- `domain-stock`: Stock validation, movement balance computation, purchase weighted-average cost, stock transfer rules
- `domain-payment`: Payment status transitions, annulment rules, stock reversion logic
- `domain-client`: Client validation rules for gestion module

### Modified Capabilities
None

## Domain Modules

| Module | Legacy Source | Business Rules |
|--------|--------------|----------------|
| `domain-order/calculation.ts` | `serviceItemsTotal()` (line 3981), `technicalBaseBudget()` (line 3968), `orderBudgetBreakdown()` logic (line 3993), `saleNetTotal()` (line 2168), `orderCollectedAmount()` (line 2173) | Sum service items, compute base budget from total minus added items, net total with returns |
| `domain-order/status.ts` | `isFinishedOrderStatus()` (line 1108), `FINISHED_ORDER_STATUSES` (line 31), `deriveRepairStatusFromServiceItems()` (line 3985), `applyFinishedTimestamp()` (line 1121), `validateOrderStatus()` in server.js (line 1382) | Valid status transitions, finished-state detection, repair status derivation from item approvals |
| `domain-order/service-items.ts` | `normalizeServiceItems()` (line 3900), `normalizeServiceItemApprovalStatus()` (line 3974), `findDuplicateServiceItemDescriptions()` (line 3955), `commitApprovedServiceItemStockLocally()` (line 3942), `restoreRemovedServiceItemStockLocally()` (line 3920) | Normalize raw items, approval status mapping, duplicate detection, stock commit/restore |
| `domain-payment/annulment.ts` | `/annul` handler (line 583–646), `annulReason` requirement (line 587), stock restoration loop (line 610–637), duplicate annulment check (line 593) | Annulment requires reason, restore stock per item, financial reversal, duplicate guard |
| `domain-payment/status.ts` | `updateOrderPaymentStatus()` (line 4069–4098), `stockCommitted` guard (line 4074), stock deduction on "Pagado" (line 4077–4083) | Payment-to-stock binding: can't revert after commit, deduct stock on paid status |
| `domain-stock/validation.ts` | Stock check in `createOrderRecord()` (line 3860–3862), `commitApprovedServiceItemStockLocally()` (line 3942–3952) | Enough-stock assertion, min-stock alert threshold |
| `domain-stock/movement.ts` | `insertGestionStockMovement()` (line 4108–4111), `mapGestionStockMovement()` (line 4113–4114), balance computation throughout server.js | Movement record shape, balanceAfter = previous balance + signed quantity |
| `domain-stock/purchase.ts` | `/purchases` handler (line 649–701), weighted-average cost formula (line 678–680) | WAC: `((oldStock × oldCost) + (newQty × newCost)) / (oldStock + newQty)`, validation of qty/cost/category/brand/model |
| `domain-stock/transfer.ts` | `/stock-transfers/web-to-workshop` handler (line 887–922), `web_transfer_out`/`web_transfer_in` movements (line 916–917), source-type guard (line 902) | Source can't be workshop type, destination ID derivation, paired movements |
| `domain-client/validation.ts` | Client creation in gestion (line 793–824 `buildLocalSaleOrder`), default client logic | Required name field, document normalization, default "Cliente Mostrador" |

## Approach

Pure functions and small domain services — no classes, no DI containers, no framework. Each module exports typed functions that accept contract types as input and return results (or throw `DomainError`). The package depends only on `@beim/contracts` for type definitions. No Prisma, no HTTP, no DB. Tests use Vitest with strict TDD (RED → GREEN → REFACTOR). Each domain module has a co-located `*.test.ts`.

## Package Structure

```
packages/domain/
├── package.json          # @beim/domain, private, deps: @beim/contracts workspace:*
├── tsconfig.json         # extends @beim/tsconfig/base.json
├── vitest.config.ts      # mirrors contracts config
└── src/
    ├── index.ts          # barrel re-exports
    ├── domain-error.ts   # custom DomainError class
    ├── order/
    │   ├── calculation.ts + .test.ts
    │   ├── status.ts + .test.ts
    │   └── service-items.ts + .test.ts
    ├── payment/
    │   ├── annulment.ts + .test.ts
    │   └── status.ts + .test.ts
    ├── stock/
    │   ├── validation.ts + .test.ts
    │   ├── movement.ts + .test.ts
    │   ├── purchase.ts + .test.ts
    │   └── transfer.ts + .test.ts
    └── client/
        └── validation.ts + .test.ts
```

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/` | New | Entire domain package with 10 modules + tests |
| `packages/contracts/` | Read-only | Domain imports contract types; no changes |
| `pnpm-workspace.yaml` | Modified | Add `packages/domain` to workspaces |
| `turbo.json` | Modified | Add domain to build/test pipelines |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Business rules misunderstood from legacy source | Medium | Cross-reference both server.js AND app.js; tests validate against legacy behavior |
| Money precision drift | Low | Use plain numbers matching contracts; document rounding rules in domain |
| Over-scoping (first slice too large) | Medium | Cap at 10 modules; defer service-order workflow, auth, API to later changes |
| Legacy edge cases missed | Medium | Treat proposal as starting point; sdd-spec will enumerate scenarios per module |

## Rollback Plan

Delete `packages/domain/` entirely, remove workspace entry from `pnpm-workspace.yaml` and `turbo.json`. No other packages depend on domain yet (data layer is successor change), so rollback is clean.

## Dependencies

- `@beim/contracts` (workspace) — types/schemas consumed by all domain modules
- `@beim/tsconfig` (workspace) — shared tsconfig base
- `vitest` (devDependency) — test runner

## Success Criteria

- [ ] `@beim/domain` builds and typechecks under ultra-strict TypeScript
- [ ] All 10 domain modules have co-located tests passing
- [ ] Zero dependency on Prisma, HTTP, DB, or any infra
- [ ] Business rules match legacy behavior (validated by test assertions against legacy code)
- [ ] `pnpm test --filter @beim/domain` exits 0
