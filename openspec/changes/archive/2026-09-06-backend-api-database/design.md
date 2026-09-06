# Design: Backend API & Database Port

> SOLO SPECS: no code here. All target paths are in Beim-System-Tech (READ-ONLY reference; edits deferred to apply there).

## REVISION 2026-09-05 — User decisions change the stack (SUPERSEDES relevant sections)

The user (maintainer) made the following route decisions after reviewing options. This revision supersedes every conflicting statement below: option 4 (JSON files first) is **dropped** in favor of **option 1 (Postgres from day one)** with `pg` raw; the API is a **new standalone app** `apps/api` (Node + TypeScript + **Express**, NOT Next.js App Router handlers inside `apps/gestion`), and the gestion module remains **untouched** (no mounting into `app/api/gestion/*`).

| Decision | Value | Why |
|---|---|---|
| Persistence | **Postgres now** (option 1), `pg` raw + `withTransaction` + `FOR UPDATE` | User picked Postgres from start; real stock safety instead of interim mutex |
| HTTP framework | **Express** (Node + TypeScript) | User-picked; mature, simple middleware, best fit for a pure JSON API; Next.js App Router rejected (heavy runtime, unnecessary for a backend-only service) |
| App location | **`apps/api`** (new workspace next to `gestion`), not inside `apps/gestion/app/api/*` | User requirement: new directory, do NOT touch/access gestion module |
| Validation | **zod** (request body/query/params middleware) | User confirmed; zod is the project standard; validates server-side before handlers |
| Error handling | Typed domain error taxonomy + central Express error middleware + `{ ok, data \| error }` envelope + `ERROR_CODES` map | New requirement from user; single place translating thrown errors to HTTP, no per-route try/catch |
| Growth path | **Modular monolith** (`src/modules/gestion`, `src/modules/webshop`, future `src/modules/notifications`); NO microservices now | User asked about microservices; rejected (org/ops cost, distributed transactions hit stock safety); modules ARE future service boundaries |
| Tests | **vitest + supertest** | Monorepo already uses vitest; supertest exercises Express HTTP layer |
| DB client | `pg` raw (chosen over Drizzle/Prisma) | Fidelity to legacy contract (jsonb + FOR UPDATE + withTransaction); no ORM abstraction over the critical stock path |
| Schema | Legacy `pagina-web/db/schema.sql` (19 tables) applied as base contract | Validated count 19 (exploration/proposal said 15 — corrected) |

### New target structure (supersedes "File Changes" table below)

```
apps/api/
├── package.json                # workspace app: express, pg, zod, vitest, supertest
├── tsconfig.json
├── src/
│   ├── config/                 # env + pg Pool (DATABASE_URL / PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD)
│   ├── errors/                 # taxonomy (ValidationError, NotFoundError, ConflictError, InsufficientStockError, AuthError), ERROR_CODES, middleware, asyncHandler
│   ├── middleware/             # zod validation, auth (role gating)
│   ├── db/                     # schema.sql (19 tables, vendored), withTransaction(), row locks
│   ├── modules/
│   │   ├── gestion/            # routes → services → repositories (pg): sales-batch, receipts, annul, financial-state singleton, stock guards, cash-sessions, clients, services, purchases, categories
│   │   └── webshop/            # auth, users, orders, checkout-sessions, promo-slides, uploads, catalog
│   └── app.ts                  # express app assembly; server.ts boot
```

### Revised migration note (supersedes "Migration / Rollout")

Postgres is the single backend from the start. No JSON-file adapter, no file-now/Postgres-later duality. Apply the 19-table legacy `schema.sql` + `seed.sql` as the base; API contract unchanged from specs (`/api/v1/...` under the new app's own express router); no data migration (fresh database).

## Technical Approach

Option 4 (hybrid ports): extend the existing Beim-System-Tech pattern — thin `route.ts` → `AuthService.session` → Handler → repository ports → swappable adapter (JSON-file default, Postgres later) — across the gestion + webshop surface under one versioned namespace `/api/v1`. Contexts split first; `products`/`beim_receipts` shared through ports. Satisfies all four delta specs.

## Architecture Decisions

| # | Decision | Alternatives (tradeoff) | Choice & Rationale |
|---|----------|------------------------|--------------------|
| 1 | Repository ports; file adapters now, Postgres later | Opt 1 REST+Postgres (migration blocks specs); opt 2 files-only (dead-end) | **Option 4** — Postgres swap without API change ("Adapter swap" scenario). |
| 2 | Flat `/api/v1/{resource}` namespace; context owns resources | Context prefix `/api/v1/gestion/...` (diverges from spec paths); unversioned (no breaking-change room) | **Flat v1** — specs literally address `/api/v1/receipts`, `/api/v1/products`; versioned from day one. |
| 3 | Ownership: gestion owns receipts, sales-batch, financial-state, stock, cash-sessions, clients, services, purchases, categories; webshop owns catalog reads, orders, checkout-sessions, promo-slides, uploads, auth | Duplicated resources per context (drift) | **Single owner per resource**; `products`/`beim_receipts` shared via one port each. |
| 4 | File-adapter tx: process-wide async mutex per data dir + existing versioned write (`JsonStore.write(doc, expectedVersion)`) | File locking (fragile); no guard (silent oversell) | **Mutex + version check** — fakes `FOR UPDATE`; stock mutations serialize per product; oversell risk documented interim per spec. |
| 5 | Stock guard: inside mutex re-read, require `stock >= qty`, decrement, write receipt + stock as one commit; failure → 409 with current stock | Pre-check outside lock (race) | **Check-inside-lock** — "Concurrent decrement safe": exactly one succeeds. |
| 6 | jsonb compat: receipt `payload` schemas passthrough; restores preserve unknown keys | Strict schemas (break old backups) | **Passthrough** — satisfies "JSONB backward compatibility". |
| 7 | Auth: dual model kept (`users`/`gestion_users`); bridge tokens hash-only + expiry; every write authorized server-side in handler | Identity unification (proposal-deferred); client role claims (spec-rejected) | **Server-side enforcement** — 401 expired, 403 without existence leak (existing `NOT_FOUND_OR_FORBIDDEN` policy). |
| 8 | HTTP mapping: add 422 (field-level validation), 415 (upload media type) | Keep 400 for validation (violates gestion-api scenario) | **Add 422/415** — spec authoritative; map already covers 401/403/404/409/503/500. |

## Data Flow

Sales-batch (gestion):

    route.ts ─▶ AuthService.session ─▶ SalesBatchHandler ─▶ UnitOfWork
         401/403 on fail                    │
                                            ▼
                              mutex(lock) ─▶ StockPort.guardDecrement
                                            ─▶ ReceiptsPort.insert(+payload)
                                            ─▶ commit | rollback ─▶ {ok,data|error}

Webshop order:

    route.ts ─▶ OrdersHandler ─▶ UnitOfWork: OrdersPort.insert(order+items, unpaid)
              ─▶ CheckoutHandler ─▶ Stripe session; payment flips only via webhook

## File Changes (target: Beim-System-Tech — deferred, no edits now)

| File | Action | Description |
|------|--------|-------------|
| `apps/gestion/app/api/v1/**/route.ts` | Create | Versioned mounts, existing handler wiring |
| `apps/gestion/src/server/data/ports.ts` | Create | `UnitOfWork`, `StockPort`, `ReceiptsPort`, `FinancialStatePort`, `OrdersPort` |
| `apps/gestion/src/server/data/file-adapters.ts` | Create | Mutex + `JsonStore`-backed adapters (default) |
| `apps/gestion/src/server/data/repositories.ts` | Modify | Multi-entity writes via `UnitOfWork` |
| `apps/gestion/src/server/handlers/errors.ts` | Modify | Add 422/415 mappings |
| `apps/gestion/src/server/handlers/sales-batch.ts`, `receipts.ts`, `financial-state.ts` | Create | Atomic batch/annul; singleton upsert |
| `apps/web/` webshop handlers + routes | Create | Catalog, orders, checkout-sessions, promo-slides, uploads, auth bridge |
| Legacy `db/schema.sql` | Reference | 15-table contract for future pg adapter |

## Interfaces / Contracts

```ts
interface UnitOfWork {
  run<T>(fn: (tx: Ports) => Promise<Result<T, GestionError>>): Promise<Result<T, GestionError>>;
}
interface StockPort {
  guardDecrement(productId: string, qty: number): Promise<Result<{ currentStock: number }, GestionError>>;
  restore(productId: string, qty: number): Promise<Result<void, GestionError>>;
}
interface FinancialStatePort {
  getSingleton(): Promise<Result<FinancialState, GestionError>>;
  upsertSingleton(state: FinancialState): Promise<Result<FinancialState, GestionError>>; // singleton_id = 1
}
```

Receipt `payload`: zod `.passthrough()`; pg adapter maps it to `jsonb` unchanged.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Handlers: validation 422, role 403, token 401 | Fixture in-memory adapters (target repo's `*.test.ts` pattern) |
| Integration | Concurrent decrements → one 409; annul restores stock; closed-session write 409 | File adapter + temp `GESTION_DATA_DIR` |
| Contract | Same port suite vs file AND future pg adapter | Shared suite per "Adapter swap" |
| E2E | None here (SOLO SPECS, no runner) | Deferred to Beim-System-Tech apply |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary (HTTP resource design only).

## Migration / Rollout

File adapters are default; Postgres arrives as a second adapter behind the same ports, env-selected at apply time — no API contract change. Legacy payloads restore via passthrough schemas. No data migration in this change.

## Open Questions

- [ ] Oldest backup that must restore cleanly — non-blocking.
- [ ] Production `repair_status` values beyond `Entregado`/`Cancelado` — non-blocking.
- [ ] Mount plan for unversioned `app/api/gestion/*` routes — apply-phase decision.
