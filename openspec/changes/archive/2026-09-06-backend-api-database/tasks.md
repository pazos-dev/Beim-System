# Tasks: Backend API & Database Port

> REVISION 2026-09-05 (user decisions): App is `apps/api` (Node + TypeScript + Express), Postgres from day one with `pg` raw, gestion module UNTOUCHED. This supersedes the previous JSON-file/Next.js-in-gestion task list.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,800–2,600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 scaffold → PR 2 persistence core → PR 3 gestion module → PR 4 webshop module |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
| Decision needed before apply | No (user approved stack choice) |

## Architecture Contract (from design.md REVISION)

- **Stack**: TypeScript strict + Express + `pg` raw + zod + vitest/supertest.
- **Error handling**: typed domain error taxonomy + central Express error middleware + `{ ok, data | error }` envelope + `ERROR_CODES` (401/403/404/409/422/415/500).
- **Modular monolith**: `src/modules/gestion`, `src/modules/webshop`; future `src/modules/notifications` (email/WhatsApp/services) as a module, NOT a microservice.
- **DB**: legacy `pagina-web/db/schema.sql` (19 tables) + `seed.sql` applied as-is; `withTransaction()` helper; `SELECT ... FOR UPDATE` stock guards.
- **Never touch** `apps/gestion/**` or `pagina-web/server.js`.

## Phase 1: Scaffold `apps/api` (PR 1)

- [x] 1.1 Create workspace app `apps/api/package.json` (name `@beim/api`, scripts dev/build/test, deps: express, pg, zod; dev: typescript, tsx, vitest, supertest, @types/*).
- [x] 1.2 Add `apps/api/tsconfig.json` (strict) + `vitest.config.ts`.
- [x] 1.3 Create `src/config/env.ts` (zod-validated env: `DATABASE_URL` or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD, `PORT`, `NODE_ENV`) + `src/config/db.ts` (pg Pool + `withTransaction`).
- [x] 1.4 Create `src/app.ts` (express app assembly, json middleware, router mount) + `src/server.ts` (boot).
- [x] 1.5 Smoke test: `GET /health` → 200 `{ ok: true, data: { status: "ok" } }`.

## Phase 2: Error System + Validation Core (PR 1 continued)

- [x] 2.1 Create `src/errors/` : `AppError` base + taxonomy (`ValidationError`, `NotFoundError`, `ConflictError`, `InsufficientStockError`, `AuthError`, `UploadMediaError`) with `ERROR_CODES` → HTTP map.
- [x] 2.2 Create `src/middleware/error-handler.ts` (single traducción throw → envelope) + `asyncHandler`.
- [x] 2.3 Create `src/middleware/validate.ts` (zod schema → body/query/params → 422 with details).
- [x] 2.4 Create `src/middleware/auth.ts` (session/role gate → 401/403, `NOT_FOUND_OR_FORBIDDEN` policy).
- [x] 2.5 Unit tests: each error maps to correct status/envelope; validation middleware returns 422.

## Phase 3: Persistence Core — Postgres (PR 2)

- [x] 3.1 Vendor `src/db/schema.sql` (19 tables) + `src/db/seed.sql` from legacy (read-only copy, do NOT edit legacy).
- [x] 3.2 Create `src/db/migrate.ts` (idempotent apply of schema+seed) + npm script `db:migrate`.
- [x] 3.3 Create `src/db/withTransaction.ts` (begin/commit/rollback wrapper).
- [x] 3.4 Create `src/modules/*/repositories/*.ts` interfaces (ports) + `pg` implementations: StockPort (guardDecrement/restore with FOR UPDATE), ReceiptsPort, FinancialStatePort, OrdersPort.
- [x] 3.5 Contract tests vs real Postgres (test DB): guardDecrement concurrent → exactly one success/one 409; annul restore; singleton upsert; jsonb passthrough.

## Phase 4: Gestion Module API (PR 3)

- [x] 4.1 `src/modules/gestion/router.ts` + handlers: sales-batch (atomic, 422 validation, 409 insufficient stock), receipts (+next-number, annul), financial-state singleton PUT, cash-sessions (+open, closed → 409), stock-movements, clients, services, purchases, categories. Mounted at `/api/v1` in `app.ts` with `resolveIdentity` option.
- [x] 4.2 SuperTest integration tests per spec scenarios (gestion-api/spec.md) — `gestion-api.test.ts` (20 cases) + service tests (24 cases), 44 new tests all green.

## Phase 5: Webshop Module API (PR 4)

- [x] 5.1 `src/modules/webshop/router.ts` + handlers: auth (login/register/gestion-access token hash+expiry → 401 expired), catalog (published products, `page`/`limit`, category/search), orders + checkout-sessions (unpaid until webhook, single pending session), promo-slides, uploads (type/size → 415/413, raw-binary, uuid+ext storage).
- [x] 5.2 SuperTest integration tests per spec scenarios (webshop-api/spec.md) — `webshop-api.test.ts` (12 routes) + `catalog-orders.test.ts` (13) + `auth.test.ts` (15), 40 new tests all green.

## Phase 6: Collateral (within PRs)

- [x] 6.1 Document in `apps/api/README.md`: env vars, migrate, dev, test, module layout, error envelope contract.
- [x] 6.2 Record 19 CREATE TABLE correction + apps/api path in design/tasks notes.
- [x] 6.3 Mark checkboxes done; handoff note in `HANDOFF.md` superseded by REVISION.