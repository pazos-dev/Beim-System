# Proposal: @beim/contracts — Shared Zod Contracts

## Intent

Every future package/app (domain, data, web, gestion) needs a single source of truth for domain shapes to avoid schema drift. Today the domain lives only in the legacy `pagina-web/db/schema.sql` + `server.js`/`sistema-gestion/app.js`. This change creates `packages/contracts` (`@beim/contracts`): Zod schemas + inferred TS types for the core domain (User, Product, Category, Order, OrderItem, Client, Service, ServiceCategory, StockMovement) plus shared enums (roles, order/payment status). It also installs+configures **Vitest**, unlocking **Strict TDD** — the runner is currently disabled at root (`openspec/config.yaml` testing.strict_tdd: false). This is the foundation for `domain`/`data`/apps.

## Scope

### In Scope
- Bootstrap `packages/contracts`: package.json (`@beim/contracts`, private), tsconfig (extend `@beim/tsconfig/base.json`), vitest config, index barrel + per-entity modules.
- Zod schemas + inferred types for core commerce + gestion entities, mapped from legacy tables (see table below).
- Shared enums: user role, currency, order status, payment status, repair/quote/qa status, stock movement type.
- Install + configure Vitest; unit tests for each schema (parse/safeParse/error paths).

### Out of Scope (successor changes)
- Domain logic (`domain`), persistence (`data`/Prisma), apps, auth flows, payments, Beim receipts/parts/payments, cash sessions, financial state, audit logs, promo slides, settings, and other peripheral tables.

## Entity → Legacy Table Mapping

| Schema | Legacy table |
|--------|--------------|
| User | `users` |
| Product | `products` |
| Category | `categories` |
| Order / OrderItem | `orders` / `order_items` |
| Client | `gestion_clients` |
| Service / ServiceCategory | `gestion_services` / `gestion_service_categories` |
| StockMovement | `gestion_stock_movements` |

## Capabilities

### New Capabilities
- `contracts`: shared Zod schemas + inferred types + shared enums for the core domain; single source of truth consumed by all layers.
- `contracts-testing`: Vitest unit-test harness for the contracts package (unlocks Strict TDD).

### Modified Capabilities
- None (foundation specs `monorepo-workspace`, `tsconfig-shared` unchanged).

## Approach

Model each legacy table as a Zod schema (kebab-case per entity), exporting `z.infer` types. Keep schemas versioned-free initially; use `numeric(12,2)` money as `z.number()`, `timestamptz` as `z.date()`/ISO strings. Compile under ultra-strict base. Vitest as devDependency with `test` script; unit tests per schema using RED-GREEN.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/contracts/` | New | Full package (package.json, tsconfig, vitest, src) |
| `openspec/config.yaml` | Modified | `testing.strict_tdd` → true once Vitest runnable |
| `package.json` | Modified | Workspace picks up new package via `packages/*` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legacy money/date types in messy formats | Med | Normalize to number/ISO; document per-field decisions |
| Ultra-strict flags reject schemas | Med | Extend base.json; fix exactOptionalPropertyTypes issues |
| Scope creep on 23 tables | Med | Ship only mapped core entities; defer rest |

## Rollback Plan

Package is additive and private. Revert by removing `packages/contracts/`, its workspace entries, and reverting `config.yaml` `strict_tdd` — no consumer depends on it yet.

## Dependencies

- Foundation (done): monorepo workspace, `@beim/tsconfig` (base.json).
- Runtime: `zod`; dev: `vitest` (workspace-resolved by pnpm).

## Success Criteria

- [ ] `packages/contracts` defined with schema for every mapped entity + enum.
- [ ] All schemas + types compile under `@beim/tsconfig/base.json`.
- [ ] `pnpm test --filter @beim/contracts` runs Vitest and passes unit tests.
- [ ] `openspec/config.yaml` reflects Strict TDD now enabled.
