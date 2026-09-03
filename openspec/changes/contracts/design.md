# Design: @beim/contracts — Shared Zod Contracts

## Technical Approach

Bootstrap a private `packages/contracts` package (`@beim/contracts`) exposing Zod schemas + inferred TS types for 9 core entities and 5 shared enums, each mapped 1:1 from legacy tables. Install Vitest as the test runner (devDependency on the package + root-visible via workspace), co-locating unit tests per schema to establish a RED-GREEN-REFACTOR baseline. Consumers import only from the barrel `@beim/contracts`. This is the single source of truth for domain shapes consumed by `domain`/`data`/apps.

Maps to proposal approach; specs `contracts-package` + `contracts-schemas` are the source of truth for requirements.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Package layout | Flat single file vs `src/` per-entity modules + `enums.ts` + `index.ts` barrel | Flat: one giant file, poor imports. Per-entity: matches legacy tables, co-located tests, clean public surface. | **Per-entity modules + barrel** (`user.ts`, `product.ts`, `category.ts`, `order.ts`, `order-item.ts`, `client.ts`, `service.ts`, `service-category.ts`, `stock-movement.ts`, `enums.ts`, `index.ts`) |
| Export strategy | Named re-export of everything vs explicit allowlist | Wildcard `export *` leaks internals. Explicit named exports keep the public surface minimal (spec: no leakage). | **Explicit `export { … }` from barrel** — as schema (`xxxSchema`) + type (`Xxx`) per entity |
| Zod version | `zod@^4` vs v3 | v4 current (4.5.4), adds `.exactOptional()`, `.iso.date()`, modern std API. v3 maintenance. | **`zod@^4`** — single import `import { z } from 'zod'`, one shared instance |
| Optional fields vs `exactOptionalPropertyTypes` | `.optional()` (infers `?: T \| undefined`) vs `.exactOptional()` (infers `?: T`) | `.optional()` widens type to `T \| undefined`, colliding with exactOptional semantics. `.exactOptional()` produces `?: T`, exact match. | **`.exactOptional()`** for optional legacy columns; `.optional()` only where `undefined` must be an accepted runtime value |
| `noUncheckedIndexedAccess` | Ignore vs design around | No array indexing by literal in schemas except `.min(1)` on `compatibleModels`; `z.infer` unaffected. | **No special code** — enums use `z.enum([...] as const)`, arrays are `z.array(...)`; no manual indexing |
| Type inference | `z.infer` per schema | `z.infer<typeof xxxSchema>` gives the parse output type, correct by construction; no hand-written interfaces to drift. | **`type Xxx = z.infer<typeof xxxSchema>`** exported from each module + barrel |
| Money/currency | `z.number()` vs `z.bigint()` vs branded string | Legacy is `numeric(12,2)` and JS operates on floats today. `z.number()` preserves decimals, no precision ops in this phase. | **`z.number()`** — record: `data` phase may adopt `decimal.js` + a branded `Money` type; do NOT add now |
| Dates | `z.date()` vs ISO string (`z.iso.date()`) | `timestamptz` returns `Date` from pg; forms/serialization are strings. | **`z.date()`** for DB-origin fields, `z.iso.date()` where strings are the source |
| Enums | `z.enum` vs `z.nativeEnum` vs const-object union | `z.nativeEnum` needs TS enum; spec wants plain string values. `z.enum([...] as const)` gives literal union + runtime check. | **`z.enum([...] as const)`** in `enums.ts`, referenced by schemas, value + type exported (e.g. `z.infer<typeof UserRole>` as `UserRole`) |
| IDs | Per-table type from legacy (uuid vs text vs number) | Fixed by existing schema — follow it exactly. | **UUID (`Users.userId`), text (products/categories/orders/clients/services/svc-categories), number (`orderItems.id` bigserial, `stockMovements.id` bigserial)** |
| Vitest config | Vitest 4, config in `vitest.config.ts`, tests co-located `src/**/*.test.ts` | Default pool. `vitest run` in `test` script; coverage via `@vitest/coverage-v8`. | **Vitest `^4.1`**; workspace devDep; `test: "vitest run"`; asserts via plain `expect` (RED-GREEN ready) |

## Data Flow

```
legacy (schema.sql / server.js) → packages/contracts/src/*.ts (zod schema)
        → z.infer → exported TS type → @beim/contracts barrel
             │
             └── consumed by domain / data / apps (single source of truth)
```

No runtime data flows within this package; it is pure schema+type definitions with self-tests.

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/contracts/package.json` | Create | `@beim/contracts`, private, `exports` → `src/index.ts`, `test: vitest run` |
| `packages/contracts/tsconfig.json` | Create | Extends `@beim/tsconfig/base.json`, sets outDir/rootDir/declaration etc. |
| `packages/contracts/vitest.config.ts` | Create | Vitest config, coverage provider, `src` environment |
| `packages/contracts/src/enums.ts` | Create | `UserRole`, `Currency`, `OrderStatus`, `PaymentStatus`, `StockMovementType` + value-type exports |
| `packages/contracts/src/{user,product,category,order,order-item,client,service,service-category,stock-movement}.ts` | Create | Per-entity Zod schemas + `z.infer` types |
| `packages/contracts/src/index.ts` | Create | Barrel (explicit named exports of schemas + types) |
| `packages/contracts/src/**/*.test.ts` | Create | Co-located unit tests per entity + enums |
| `package.json` | Modify | Workspace auto-picks up via `packages/*` (no change needed); root `test` already via turbo |
| `openspec/config.yaml` | Modify | `testing.strict_tdd: true` — set by orchestrator after Vitest verified runnable, per proposal |
| `pnpm-lock.yaml` | Modify | Regenerated by `pnpm install` (zod + vitest) |

## Interfaces / Contracts

```ts
// enums.ts
export const UserRole = z.enum(['cliente', 'admin', 'superadmin'] as const);
export type UserRole = z.infer<typeof UserRole>;
// -- Currency: UYU|USD|USDT; OrderStatus: Pendiente|Pagado|Enviado|Entregado|Cancelado
// -- PaymentStatus: 'Pendiente de pago'|'Pagado'|'Parcial'|'Rechazado'; StockMovementType: sale|purchase|adjustment|return|transfer

// user.ts
export const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  // ... required/optional per spec, optional via .exactOptional()
  role: UserRole,
  createdAt: z.date(), updatedAt: z.date(),
});
export type User = z.infer<typeof userSchema>;

// product.ts (money = plain number, per proposal)
price: z.number(), currency: Currency, compatibleModels: z.array(z.string()),

// index.ts (barrel) — explicit named exports only
export { userSchema } from './user';
export type { User } from './user';
// ... one export line per schema + type
```

Consumption contract: `import { userSchema, type User } from '@beim/contracts'`. This package is the definitive shape source; `domain`/`data` import types here, never redefine shapes.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Each schema happy path (`parse`, `safeParse.success`) | RED-GREEN; per-entity `*.test.ts` |
| Unit | Missing required field rejection | `safeParse` → `success === false`, error names missing field |
| Unit | Type mismatch (e.g. `price: "x"`) | `safeParse` → `false`, error on `price` |
| Unit | Enum rejection (`role: "invalid"`, `status: "Unknown"`) | → `false`, enum/union error |
| Unit | Optional-field omission + money decimals (`1234.56`) | `parse` succeeds, values preserved |
| Integration | `pnpm test --filter @beim/contracts` passes at root | Vitest `vitest run`; `@vitest/coverage-v8` threshold 0 this phase |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (Vitest itself is invoked via standard npm/turbo taps; no custom process orchestration.)

## Migration / Rollout

No data migration — additive private package with no consumers yet. Rollback: remove `packages/contracts/`, revert `config.yaml` `strict_tdd`, drop lockfile entries.

## Open Questions

- [ ] Zod version pin — approve `zod@^4` (4.5.4) vs explicitly v3 for wider ecosystem familiarity? (Design assumes v4.)
- [ ] Confirm `active` default-boolean and `stock_committed` boolean handling — spec text only, no BEIM-specific semantics in scope.
