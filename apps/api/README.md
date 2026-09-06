# @beim/api

Backend API for the Beim System (gestion + webshop), built as a modular
monolith. New standalone workspace app — the gestion UI (`apps/gestion`) and
legacy systems remain untouched.

> Agent usage guide (Spanish): [`docs/USO.md`](docs/USO.md) — mounts, auth,
> endpoint reference, flow deep-dives, persistence, errors and testing.

## Stack

- Node 20+ · TypeScript (strict) · Express 5
- `pg` (raw SQL + `withTransaction`) · Postgres from day one
- zod (request validation) · vitest + supertest (tests)

## Quick start

```bash
pnpm install                                # install workspace deps
cp apps/api/.env.example apps/api/.env      # configure DATABASE_URL, PORT
pnpm dev-api                                # root shortcut -> @beim/api dev (http://localhost:4000)
pnpm start-api                              # root shortcut -> build + start (production)
pnpm --filter @beim/api dev                 # tsx watch, http://localhost:4000
pnpm --filter @beim/api test                # vitest run (co-located *.test.ts)
pnpm --filter @beim/api typecheck           # tsc --noEmit
pnpm --filter @beim/api build               # tsc -> dist/
pnpm --filter @beim/api start               # node dist/server.js
```

`db:migrate` (declared as `tsx src/db/migrate.ts`) applies the vendored
legacy `schema.sql` + `seed.sql`; the script is idempotent (all DDL is
`IF NOT EXISTS`, seed rows use `ON CONFLICT`) and exits 0/1. Set
`MIGRATE_DROP_FIRST=1` to `DROP SCHEMA public CASCADE` first — **dev only**.
No migration is run by boot or by tests.

Contract tests run by default against a dedicated test database
(`TEST_DATABASE_URL`, default `postgres://beim@127.0.0.1:5432/beim_api_test`):
they create, migrate and drop it themselves, and refuse to run against a
non-`*_test` database. The dev database is never touched by tests. Suites
cover guardDecrement concurrency (exactly one success / one 409), annul
restore, financial-state singleton upsert, jsonb payload passthrough, and
orders insert + catalog pagination.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection string (wins over `PG*`) |
| `PGHOST` / `PGPORT` / `PGDATABASE` / `PGUSER` / `PGPASSWORD` | — | Connection string built from parts when `DATABASE_URL` is absent |
| `PORT` | `4000` | HTTP port |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `TEST_DATABASE_URL` | `postgres://beim@127.0.0.1:5432/beim_api_test` | Contract test database (created/migrated/dropped by the suite) |
| `MIGRATE_DROP_FIRST` | — | `1` drops `schema public` before migrating — dev only |
| `UPLOADS_DIR` | `uploads` | Webshop uploads directory (created if missing) |
| `MAX_UPLOAD_BYTES` | `5242880` | Upload size cap in bytes; over it → `PAYLOAD_TOO_LARGE` 413, nothing written |
| `CHECKOUT_BASE_URL` | `http://localhost:4000` | Base for `{ id, url }` checkout sessions (`<base>/checkout/<id>`) |
| `SESSION_TTL_DAYS` | `30` | Webshop session lifetime (one active session per user; login revokes the previous one) |
| `CHECKOUT_SESSION_TTL_MINUTES` | `60` | Checkout session lifetime; payment stays unpaid until the webhook flips it |

## Module layout

```
src/
├── config/       # env (zod-validated) + pg Pool; re-exports withTransaction
├── errors/       # AppError base, taxonomy, ERROR_CODES, envelope builders
├── middleware/   # error-handler, zod validate, auth role gate
├── modules/      # gestion | webshop: ports/ + repositories/pg-*.ts + services/
│   ├── gestion/  # ports.ts + repositories (stock, receipts, financial-state)
│   └── webshop/  # ports.ts + repositories (auth, orders, catalog, promo-slides) + services (auth, catalog, orders, uploads)
├── db/           # vendored schema.sql + seed.sql (19 tables) + idempotent
│                 # migrations/ (0001: published flag + webshop/checkout sessions),
│                 # withTransaction.ts, contract.test.ts (real Postgres)
├── app.ts        # Express app assembly (health, module mounts, error handler)
└── server.ts     # boot + graceful shutdown
```

## Error envelope contract

Every response is either `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": { "code", "message", "details?" } }`. Status codes
come from `ERROR_CODES` (src/errors/taxonomy.ts):

| Code | HTTP | Message (es) |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Datos de entrada inválidos |
| `AUTHENTICATION_REQUIRED` | 401 | Autenticación requerida |
| `FORBIDDEN` | 403 | No tiene permisos para realizar esta operación |
| `NOT_FOUND_OR_FORBIDDEN` | 404 | Recurso no encontrado |
| `CONFLICT` | 409 | Conflicto con el estado actual del recurso |
| `INSUFFICIENT_STOCK` | 409 | Stock insuficiente |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Tipo de medio no soportado |
| `PAYLOAD_TOO_LARGE` | 413 | Archivo demasiado grande |
| `DEPENDENCY_UNAVAILABLE` | 503 | Dependencia no disponible |
| `INTERNAL_ERROR` | 500 | Error interno del servidor |

Handlers throw domain errors (or `next(err)`); the central error middleware
translates them once — no per-route try/catch. Async handlers use
`asyncHandler`. Unknown errors never leak their original message to clients
(the handler logs them).