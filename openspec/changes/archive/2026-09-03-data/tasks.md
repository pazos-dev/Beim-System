# Tasks: Data Persistence Layer (`packages/data`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,500–1,800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Bootstrap + Prisma schema | PR 1 | `pnpm --filter @beim/data exec prisma generate` | N/A — declarative schema, no runtime | Delete `packages/data/` entirely |
| 2 | Mapper + money utils (TDD) | PR 2 | `pnpm --filter @beim/data exec vitest run` | N/A — pure functions, mocked Decimal | Delete `src/mapper/` directory |
| 3 | Data-access reads + singleton | PR 3 | `pnpm --filter @beim/data exec vitest run` | N/A — mocked Prisma client | Delete read access files only |
| 4 | Data-access writes + search | PR 4 | `pnpm --filter @beim/data exec vitest run` | N/A — mocked Prisma client | Delete write access files only |
| 5 | Seed + barrel + final compile | PR 5 | `pnpm --filter @beim/data exec vitest run && pnpm typecheck` | N/A — mocked Prisma for seed test | Delete `src/seed.ts`, `src/index.ts` |

## Phase 1: Package Bootstrap

- [x] 1.1 Create `packages/data/package.json` — name `@beim/data`, type module, deps: prisma, @prisma/client, tsx; devDeps: @beim/contracts workspace:\*, vitest; prisma.seed config.
- [x] 1.2 Create `packages/data/tsconfig.json` extending `@beim/tsconfig/node.json` with prisma output path.
- [x] 1.3 Create `packages/data/.env.example` with `DATABASE_URL=postgresql://user:pass@localhost:5432/beim`.
- [x] 1.4 Run `pnpm install` — verify lockfile updates and `@beim/data` resolves in workspace.

## Phase 2: Prisma Schema

- [x] 2.1 Create `prisma/schema.prisma` — datasource postgresql, generator client, 5 enums (`UserRole`, `Currency`, `OrderStatus`, `PaymentStatus`, `StockMovementType`). Verify: values match `@beim/contracts/src/enums.ts`. Acceptance: SC-ENUM-01.
- [x] 2.2 Add 23 models — `Decimal(12,2)`/`Decimal(14,2)` for money, `Json` for jsonb, `String` for `beim_receipts.price`, `@default(auto())` for BigInt serial PKs. Verify: `prisma format` succeeds. Acceptance: SC-DECIMAL-01, SC-TEXT-01, SC-JSON-01.
- [x] 2.3 Add `@relation` directives with cascade rules matching legacy SQL (e.g., order_items cascade delete, users set null). Verify: `prisma generate` succeeds. Acceptance: SC-CASCADE-01.
- [x] 2.4 Add `@@index` and `@@unique` directives replicating all legacy indexes/constraints (users.username, users.email, products.product_code, etc.). Acceptance: SC-INDEX-01, SC-UNIQUE-01.

## Phase 3: Mapper + Money Utils (Strict TDD)

- [x] 3.1 RED: Write `src/mapper/money.test.ts` — parseBeimMoney: standard `"35.600"`→35600, comma-decimal `"1.234,56"`→1234.56, garbage `"$ 35.600 UYU"`→35600, empty/null→0. GREEN: Implement `src/mapper/money.ts`. Acceptance: SC-STANDARD-01, SC-COMMA-01, SC-GARBAGE-01, SC-EMPTY-01.
- [x] 3.2 RED: Write `src/mapper/user.test.ts` — full row→contract, Decimal→number, null→undefined, enum passthrough. GREEN: `src/mapper/user.ts`. Acceptance: SC-USER-01, SC-ROLE-01, SC-NULL-01.
- [x] 3.3 RED: Write `src/mapper/product.test.ts` — Decimal price conversion, array `compatibleModels`. GREEN: `src/mapper/product.ts`. Acceptance: SC-PRODUCT-01, SC-ARRAY-01.
- [x] 3.4 RED: Write `src/mapper/category.test.ts` — self-referential parentId. GREEN: `src/mapper/category.ts`.
- [x] 3.5 RED: Write `src/mapper/order.test.ts` — enums, Decimal total, nested OrderItem mapping. GREEN: `src/mapper/order.ts` (`toOrderContract`, `toOrderItemsContract`).
- [x] 3.6 RED: Write `src/mapper/receipt.test.ts` — text `price` via `parseBeimMoney`, Json `payload` passthrough. GREEN: `src/mapper/receipt.ts`. Acceptance: SC-PAYLOAD-01.
- [x] 3.7 RED: Write `src/mapper/client.test.ts`, `service.test.ts`, `stock-movement.test.ts`. GREEN: Implement all three mappers.

## Phase 4: Data-Access Layer (Strict TDD)

- [x] 4.1 Create `src/access/prisma.ts` — singleton PrismaClient instance with lazy init.
- [x] 4.2 RED: Tests for `listUsers`, `getUserById`, `upsertUser` — verify contract output. GREEN: `src/access/user.ts`. Acceptance: SC-GETUSER-01, SC-LISTUSER-01.
- [x] 4.3 RED: Tests for `listProducts` (categoryId filter), `getProductById`, `upsertProduct` — verify Decimal→number at boundary. GREEN: `src/access/product.ts`. Acceptance: SC-LISTFILTER-01, SC-READPRICE-01.
- [x] 4.4 RED: Tests for category + stock-movement access functions. GREEN: `src/access/category.ts`, `src/access/stock-movement.ts`.
- [x] 4.5 RED: Tests for `createOrder`, `updateOrder`, `listOrders`, `getOrderById` — no business logic. GREEN: `src/access/order.ts`. Acceptance: SC-NODOMAIN-01.
- [x] 4.6 RED: Tests for `createReceipt`, `updateReceipt`, `getReceiptById`, `searchReceipts` (case-insensitive LIKE across client_name, client_id, device_model, imei_serial). GREEN: `src/access/receipt.ts`. Acceptance: SC-SEARCH-01.
- [x] 4.7 RED: Tests for `upsertClient` — find by document/name, update if exists, create if not. GREEN: `src/access/client.ts`. Acceptance: SC-UPSERTCLIENT-01, SC-NEWCLIENT-01.
- [x] 4.8 RED: Tests for `listServices`, `upsertService`, `upsertServiceCategory`, `deleteServiceCategory`, `deleteService`. GREEN: `src/access/service.ts`.

## Phase 5: Seed + Barrel + Final Compile

- [x] 5.1 RED: Write `src/seed.test.ts` — idempotency (second run succeeds), correct counts (3 users, 7 categories, 6 products, 3 slides, 1 settings), non-seed tables empty. GREEN: `src/seed.ts` with upsert-based idempotent seed. Acceptance: SC-SEED-01 through SC-SEED-09.
- [x] 5.2 Create `src/index.ts` barrel — re-export mapper functions, access functions, prisma client singleton.
- [x] 5.3 Final verification: `pnpm --filter @beim/data exec vitest run && pnpm typecheck`.
