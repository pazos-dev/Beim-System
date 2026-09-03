# Proposal: Data Persistence Layer (`packages/data`)

## Intent

The `packages/data` package is a hard prerequisite for every consumer app (web-app, gestion, desktop, mobile). Without it, no app can persist or query business data. The legacy system uses raw SQL with a `parse_beim_money` function that parses text money fields via regex — this must be replaced with a typed Prisma schema and a thin mapper layer that feeds `@beim/domain` services and `@beim/contracts` types.

## Scope

### In Scope
- Prisma schema for all 23 legacy tables (schema.sql + server.js dynamic tables)
- Generated Prisma client (`@prisma/client`)
- Money migration strategy: `numeric(12,2)` columns stay numeric; text money fields (`beim_receipts.price`) get a `parseBeimMoney` utility in the mapper
- Thin data-access layer mapping Prisma results → `@beim/contracts` types
- Seed script reproducing `pagina-web/db/seed.sql`
- Mapper + seed tests (Vitest)

### Out of Scope
- API routes, auth middleware, UI components
- DB hosting / migration wiring beyond `prisma/schema.prisma`
- Legacy data migration tooling (future `sdd-data-migration` change)
- Adding new columns or changing legacy column semantics

## Capabilities

### New Capabilities
- `data-persistence`: Prisma schema, generated client, seed, and data-access mapper for all 23 legacy tables
- `money-utils`: `parseBeimMoney` utility and numeric conversion helpers replacing the SQL `parse_beim_money` function

### Modified Capabilities
None — no existing specs change.

## Approach

1. **Schema**: Translate each SQL table to a Prisma model. Map `text CHECK` enums (`users.role`, `orders.status`, `payment_status`) to Prisma `enum` types matching `@beim/contracts` enums. Map `jsonb` payload columns to `Json` type.
2. **Money**: Keep `numeric(12,2)` columns as `Decimal` in Prisma. The `beim_receipts.price` text column gets a `parseBeimMoney()` helper in the mapper that replicates the SQL regex (`replace non-digits, comma→dot, coalesce to 0`).
3. **Mapper**: One file per domain area (user, product, order, receipt, stock, client, service). Each maps Prisma row → `@beim/contracts` type using camelCase conversion. Domain services consume contract types, not Prisma types.
4. **Seed**: Port `seed.sql` to a Prisma seed script with identical data.
5. **Indexes**: Replicate all legacy indexes in `@@index` directives.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/data/` | New | Entire package: schema, client, mapper, seed, tests |
| `packages/data/prisma/schema.prisma` | New | 23 models + enums + indexes |
| `packages/data/src/mapper/` | New | Per-domain row→contract mappers |
| `packages/data/src/seed.ts` | New | Seed script |
| `pnpm-workspace.yaml` | Modified | Add `packages/data` workspace entry |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Prisma `Decimal` vs JS `number` mismatch | Medium | Mapper converts `Decimal` → `number` at boundary; contracts use `z.number()` |
| `beim_receipts.price` text→numeric data loss | Low | `parseBeimMoney` handles all legacy formats; tested against seed data |
| Missing tables (created dynamically in server.js) | Low | Identified all 4 dynamic tables; included in schema |

## Rollback Plan

Delete `packages/data/` directory and remove workspace entry. No other packages depend on it yet — fully additive, zero blast radius.

## Dependencies

- `@beim/contracts` (Zod schemas + enums — already built)
- `@beim/domain` (pure services — already built, data layer maps TO it)
- Prisma CLI + PostgreSQL (runtime dependency)

## Success Criteria

- [ ] `prisma generate` succeeds with all 23 models
- [ ] `pnpm test` passes in `packages/data` (mapper + seed tests)
- [ ] Every mapper output satisfies the corresponding `@beim/contracts` Zod schema
- [ ] Seed script produces identical data to `seed.sql`
- [ ] No `any` types; ultra-strict TS passes
