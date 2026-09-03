# Tasks: @beim/contracts — Shared Zod Contracts

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 750–900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Package bootstrap + enums + barrel skeleton | PR 1 | `pnpm test --filter @beim/contracts` | N/A — pure types | `packages/contracts/` |
| 2 | Commerce schemas (user, product, category, order, order-item) + tests | PR 2 | `pnpm test --filter @beim/contracts` | N/A — pure validation | `src/{user,product,category,order,order-item}.ts` + tests |
| 3 | Gestion schemas (client, service, service-category, stock-movement) + tests + strict_tdd unlock | PR 3 | `pnpm test --filter @beim/contracts` | N/A — pure validation | `src/{client,service,service-category,stock-movement}.ts` + tests + config.yaml |

## Phase 1: Package Bootstrap

- [x] 1.1 Create `packages/contracts/package.json` — `@beim/contracts`, private, exports `src/index.ts`, devDeps zod + vitest
- [x] 1.2 Create `packages/contracts/tsconfig.json` — extend `@beim/tsconfig/base.json`, outDir `dist`, rootDir `src`
- [x] 1.3 Create `packages/contracts/vitest.config.ts` — include `src`, coverage `@vitest/coverage-v8`
- [x] 1.4 Create `src/enums.ts` — `UserRole`, `Currency`, `OrderStatus`, `PaymentStatus`, `StockMovementType` as `z.enum([...as const])` with value + type exports
- [x] 1.5 Create `src/index.ts` barrel — re-export enums only initially
- [x] 1.6 Run `pnpm install` — resolve zod + vitest workspace deps

## Phase 2: Commerce Schemas

- [x] 2.1 Create `src/user.ts` — `userSchema` + `User`; required: name, passwordHash, role; optional via `.exactOptional()`
- [x] 2.2 Create `src/product.ts` — `productSchema` + `Product`; `price: z.number()`, `currency: Currency`, `compatibleModels: z.array(z.string())`
- [x] 2.3 Create `src/category.ts` — `categorySchema` + `Category`; required: name, code, description
- [x] 2.4 Create `src/order.ts` — `orderSchema` + `Order`; required: customer, total, currency, status, paymentStatus
- [x] 2.5 Create `src/order-item.ts` — `orderItemSchema` + `OrderItem`; `quantity: z.number().int().positive()`
- [x] 2.6 Update `src/index.ts` — explicit named exports for all 5 commerce schemas + types

## Phase 3: Gestion Schemas

- [ ] 3.1 Create `src/client.ts` — `clientSchema` + `Client`; required: name
- [ ] 3.2 Create `src/service.ts` — `serviceSchema` + `Service`; required: name, categoryName, costPrice, salePrice
- [ ] 3.3 Create `src/service-category.ts` — `serviceCategorySchema` + `ServiceCategory`; required: name
- [ ] 3.4 Create `src/stock-movement.ts` — `stockMovementSchema` + `StockMovement`; required: productId, movementType, quantity, balanceAfter
- [ ] 3.5 Update `src/index.ts` — add explicit named exports for 4 gestion schemas + types
- [ ] 3.6 Update `openspec/config.yaml` — set `testing.strict_tdd: true`

## Phase 4: Tests (RED-GREEN-REFACTOR)

- [ ] 4.1 Create `src/enums.test.ts` — valid parse per enum + invalid value rejection
- [ ] 4.2 Create `src/user.test.ts` — valid parse, missing required field, enum rejection, optional omission
- [ ] 4.3 Create `src/product.test.ts` — valid parse, type mismatch on price, money decimals preserved
- [ ] 4.4 Create `src/category.test.ts` — valid parse, missing required field
- [ ] 4.5 Create `src/order.test.ts` — valid parse, enum rejection, optional omission
- [ ] 4.6 Create `src/order-item.test.ts` — valid parse, quantity ≤ 0 rejection
- [ ] 4.7 Create `src/client.test.ts` — valid parse, missing required field
- [ ] 4.8 Create `src/service.test.ts` — valid parse, type mismatch on costPrice
- [ ] 4.9 Create `src/service-category.test.ts` — valid parse, missing name rejection
- [ ] 4.10 Create `src/stock-movement.test.ts` — valid parse, invalid movementType rejection

## Phase 5: Validation

- [ ] 5.1 Run `pnpm install` — verify zod + vitest resolve
- [ ] 5.2 Run `turbo run typecheck --filter @beim/contracts` — zero errors under ultra-strict base
- [ ] 5.3 Run `pnpm test --filter @beim/contracts` — all tests pass
- [ ] 5.4 Run `turbo run typecheck` — no workspace regressions
