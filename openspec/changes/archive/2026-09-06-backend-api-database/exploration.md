# Exploration: backend-api-database

> SOLO SPECS track. No code implementation in System-Beim-workflow. Target application repo: Beim-System-Tech (deferred).

## Current State

Legacy backend behavior is split across two vanilla-JS codebases (read-only reference: `sistema-Beim---para-luis/`):

**1. `sistema-gestion/` (6306-line `app.js` + 645-line `index.html`) — offline-first management console**
- Single-page app; `app.js` is the whole domain layer (state, rendering, reports, role gating).
- Persistence is **localStorage-first**: master key `sistema-gestion-data-v1` holding `{ clients, orders, productCategories, webProductCategories, products, sales, expenses, services, serviceCategories }`, plus satellite keys for capital (`...-capital-inicial-v1`), accounting state, menu config, category order, fixed-expense names, phone brands/models (`beim_boleta_marcas/modelos_v1`), purchase suppliers, category tree, sidebar collapsed, last-save meta.
- Session is `sessionStorage` (`sistema-gestion-current-user-v1`); role permissions fetched from server but enforced client-side.
- Server sync is **backup-only, not source of truth**: `GESTION_API_URL = http://127.0.0.1:3000/api/gestion`; `PUT /financial-state` (capital, expenses, menu, accounting, preferences) and `POST/GET /backups` (opaque snapshot incl. serialized localStorage slices). `apiOnline` flag gates persistence; failure degrades silently to local.
- IDs are client-generated (`uid(prefix)` = timestamp36 + random); no server identity for gestion entities.

**2. `pagina-web/` (4598-line `server.js` + 4759-line `script.js`, raw `node:http`, no framework) — storefront + real backend**
- `server.js` is a monolithic router (~60 route branches on `url.pathname` + method) with inline SQL. Dual entities:
  - *Webshop*: `users, categories, products, promo_slides, orders, order_items, audit_logs`, auth (`/api/auth/*`: login, register, google, facebook, gestion-access), Stripe checkout, uploads.
  - *Gestion bridge*: `/api/gestion/*` — financial-state, backups, stock-movements, cash-sessions (+`/open`), management-login/setup/users/role-permissions/web-users/web-launch, clients, services, service-categories, sales-batch, sales, purchases, receipts (+`/next-number`), categories, stock-transfers/web-to-workshop, products. Receipt flow writes `beim_receipts` + `beim_receipt_parts/payments/checklists`, decrements `products.stock` with `SELECT ... FOR UPDATE` guards, restores stock on annul.
- Persistence assumption is **Postgres-optional**: `db.js` (`pg` pool, `DATABASE_URL` or `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD`, `withTransaction` begin/commit/rollback helper, `getDatabaseHealth`). `BEIM_STORAGE_MODE=local|postgres` (default `local`); non-postgres mode throws on query — webshop degrades to local storage while gestion bridge requires Postgres for financial state.
- Schema: `db/schema.sql` (392 lines, 15 tables) — `app_settings, users, categories, products, promo_slides, orders, beim_receipts (payload jsonb + services/visual_items text[]), order_items, beim_receipt_parts/payments/checklists, audit_logs, beim_fixed_expenses, gestion_cash_sessions, gestion_financial_state (singleton_id=1 upsert), gestion_payment_movements, gestion_users, gestion_role_permissions, gestion_web_access_tokens`. Heavy `jsonb` payload columns alongside relational columns (hybrid relational/document).

**3. Target state in Beim-System-Tech (already partially ported, Next.js App Router)**
- `apps/gestion/app/api/gestion/*` route handlers (productos, ordenes, ventas, compras, caja, stock, reportes, auth, admin, bootstrap) follow a consistent pattern: `AuthService.session(cookie)` → `*Handler` + repository over `GESTION_DATA_DIR` JSON files (`data/*.json`: productos, ordenes, ventas, clientes, servicios, categorias, compras, gastos, sesiones-caja, movimientos-stock, users, sesiones, menu, role-permissions...). Standard envelope `{ ok, data | error }` with `ERROR_CODES` + HTTP mapping.
- Only browser `localStorage` left is UI chrome (sidebar collapsed, theme) — domain state moved server-side. No Prisma/Drizzle; no Postgres client in `src/`.

## Affected Areas
- `sistema-Beim---para-luis/sistema-gestion/app.js` — canonical entity shapes, validation rules, calculation logic (margins, cash sessions, report engine) to port.
- `sistema-Beim---para-luis/sistema-gestion/index.html` — form-level required-field/role-gating constraints that imply API validation.
- `sistema-Beim---para-luis/pagina-web/server.js` — route inventory (~60 endpoints), transaction boundaries (`withTransaction`, `FOR UPDATE`), stock decrement/restore, receipt state machine.
- `sistema-Beim---para-luis/pagina-web/db/schema.sql` + `db/seed.sql` — relational contract to carry forward or supersede.
- `sistema-Beim---para-luis/pagina-web/db.js` — storage-mode pattern (`local` vs `postgres`) and connection config to decide on.
- `Beim-System-Tech/apps/gestion/app/api/gestion/*` — existing Next.js handlers/repositories that already cover part of this surface (extend, don't duplicate).
- `Beim-System-Tech/apps/gestion/data/*.json` — current JSON-file persistence that a Postgres move would replace.
- `Beim-System-Tech/pagina-web/*`, `Beim-System-Tech/sistema-gestion/*` — vendored legacy copies; source of drift risk.

## Backend-Relevant Behavior Extracted

### Entities (legacy names → candidate resources)
| Legacy | Fields / notes | Candidate API resource |
|---|---|---|
| clients | id (client-uid), name, document (default `-`, unique-ish), phone, email; `client-default` always present | `clients` |
| products | id, name (brand+model+color composed, category-prefixed), categoryId, brand/model/color, costPrice, salePrice/price (Number-coerced), stock, inventoryScope (web/workshop?) | `productos` ✅ exists |
| productCategories / webProductCategories / serviceCategories | id, name; ordered list; General default | `categorias` (unified?) |
| services | id, name, costPrice, salePrice, productKey/productName/brand/model link, active flag | `servicios` (page exists, API TBD) |
| sales | line items `{name, price, cost, type, itemType, productId, consumesStock}`, totals reduced client-side; paymentStatus; saleId embedded in receipt payload | `ventas` ✅ exists |
| purchases (compras) | supplier list (`purchase-suppliers` key), manual cost inputs | `compras` ✅ exists |
| orders (ordenes) | clientId + denormalized clientName/clientDocument, serviceItems (normalized), budget (Number) | `ordenes` ✅ exists |
| expenses / fixed expenses | concept/name + amount (min 0, step 0.01, required), category reset/clear markers | `gastos` inside `caja`? |
| cash sessions (caja) | open/close, capitalInitial, accountingState blob | `caja` ✅ exists |
| stock movements / transfers | decrement with `stock >= qty` guard, restore on annul, web-to-workshop transfer | `stock` ✅ exists |
| receipts (boleta, `beim_receipts`) | repair_status state machine (Entregado/Cancelado), client/device fields, services/visual_items arrays, price/payment_status, unlock fields, terms, payload jsonb, quote items, payment movements | `receipts`/`boleta` (bridge TBD) |
| users (web) + gestion_users + role_permissions + web_access_tokens | dual user tables, token_hash with expiry, management-setup bootstrap | `auth`, `admin/roles` ✅ exist |
| financial_state (singleton) | capital_initial, expenses/menu/accounting/preferences jsonb, upsert on singleton_id=1 | `bootstrap`/`financial-state` |
| audit_logs | actor_user_id, actor_role, action, entity_type/id, details jsonb | `reportes`/audit |

### Data flows
1. Gestion console: form → in-memory `state` → `localStorage` → debounced `PUT /financial-state` + periodic opaque `POST /backups`. Read path is local-first; server is restore source only.
2. Sale: build line items (service+linked product or product, `consumesStock` flag) → `POST /gestion/sales-batch` or `/sales` → transaction: `FOR UPDATE` lock product → `stock >= qty` check → decrement → insert receipt + payload → return. Failure rolls back; insufficient stock returns current stock for message.
3. Annul: `FOR UPDATE` receipt by `payload->>'saleId'` → restore each product stock → mark `Cancelado`, price `0`, payment `Sin abonar`, rewrite payload.
4. Receipt payment: lock receipt → append `gestion_payment_movements` → `jsonb_set` payload `gestionPaid/gestionPaidAt`.
5. Webshop order: `POST /api/orders` → insert order + items → Stripe checkout session → payment-status webhook/audit write.
6. Auth: web login/register/OAuth → users row; gestion console management-login → gestion_users + sessionStorage; web-launch mints `gestion_web_access_tokens` (hash, expiry) bridging the two.

### Validation rules (observed, mostly client-side — MUST become server-side)
- Required: subcategory label, expense concept/name, client document (fallback `-`), management name when setup needed.
- Numeric: amounts/prices `min 0, step 0.01`, `Number(...)` coercion with `|| 0` fallback; price fallback chain `salePrice ?? price ?? 0`; `isFinite && > 0` else 0 for line items.
- Stock: `stock >= qty` enforced in SQL (`WHERE stock >= $2 ... RETURNING`), low-stock badge at `stock <= lowStockLimit(product)`.
- State machine: receipt `repair_status` transitions; cancel only via annul path with stock restore.
- Denormalization invariant: order caches `clientName/clientDocument`; product name embeds category prefix.

### Persistence assumptions
- Gestion console assumes **offline-capable single-user**: localStorage is truth, server is backup. Concurrent multi-user editing is unsafe (last-write-wins snapshots).
- Pagina-web assumes **single Postgres** with `pg` pool, manual transactions, `FOR UPDATE` pessimistic locking; `local` mode = degraded webshop.
- JSONB payload columns assume **schema-flexible evolution** without migrations; relational columns assume queryable core (stock, price, status).

### API surface needed (from legacy route inventory)
- Gestion bridge: `bootstrap, financial-state (PUT), backups (GET/POST), stock-movements, cash-sessions (+open), management-{login,setup-status,setup,users,role-permissions,web-users,web-launch}, clients, services, service-categories, sales-batch, sales, purchases, receipts (+next-number), categories, stock-transfers/web-to-workshop, products` — most already exist as Next.js handlers; `receipts/boleta`, `sales-batch` atomicity, `financial-state` singleton semantics are the gaps.
- Webshop: `auth/*, users, orders, beim/receipts (+next-number), stripe/checkout-session, settings/store, categories, products, uploads/product-image, promo-slides, catalog/bootstrap, health` — largely unported.

## Approaches
1. **REST + Postgres (carry forward `schema.sql`, replace JSON files)** — port legacy SQL/transaction patterns into Next.js route handlers with `pg` pool + `withTransaction` helper.
   - Pros: closest to legacy semantics; keeps `FOR UPDATE` stock safety; single source of truth; matches `BEIM_STORAGE_MODE=postgres` intent.
   - Cons: needs migration story for JSON-file data; connection config/secrets handling; heavier local dev.
   - Effort: High
2. **REST + JSON-file repositories (extend current Beim-System-Tech pattern)** — keep `data/*.json` repositories, add missing resources (receipts, sales-batch, financial-state) with file locking.
   - Pros: zero infra; consistent with existing handlers; fast iteration.
   - Cons: no real transactions; concurrent stock updates unsafe; snapshot-restore model persists; dead-end for multi-user.
   - Effort: Medium
3. **REST + Postgres with Prisma/Drizzle (typed data layer)** — same API surface as (1) but ORM-managed schema/migrations instead of raw SQL.
   - Pros: type safety; migrations; less inline SQL drift.
   - Cons: new dependency + conventions; must still model jsonb payloads and `FOR UPDATE` paths; learning curve.
   - Effort: High
4. **Hybrid: JSON files now, Postgres behind repository interfaces** — define repository ports now (per api-design-principles: resource nouns, plural collections, versioned `/api/v1/...`), ship file adapters, swap to Postgres adapters later.
   - Pros: unblocks specs now; preserves future Postgres move; testable via fixture adapters.
   - Cons: interface design cost upfront; double implementation over time; transaction semantics must be faked in file adapter.
   - Effort: Medium

## Recommendation
No decision taken (per brief: compare without deciding). For proposal authors: options 1 and 4 deserve full costing — option 1 if multi-user stock safety is a near-term requirement, option 4 if the team wants spec velocity now with a clean swap later. Option 2 is viable only as an explicitly interim step with concurrency caveats documented.

## Risks
- Client-side-only validation and last-write-wins snapshots silently carried into server design → data corruption under concurrency.
- `jsonb` payload + denormalized names (clientName on order, category prefix in product name) become de-facto contracts; changing them breaks restore compatibility.
- Dual user tables (`users` vs `gestion_users`) + token bridge is an auth seam with privilege-escalation risk if role enforcement stays client-side.
- Raw `node:http` error paths (bare 500s, Spanish string errors) leak into API contract if ported literally instead of the `{ ok, error }` envelope.
- Scope creep: webshop surface (Stripe, OAuth, uploads) vs gestion surface are two bounded contexts sharing tables (`products`, `beim_receipts`) — merging them in one change risks a >400-line review.

## Assumptions (open doubts recorded — do NOT block)
1. Assumption: stock safety (`FOR UPDATE` + `stock >= qty`) MUST be preserved in any port. Question: is oversell currently possible in JSON-file mode, and is that acceptable interim?
2. Assumption: `gestion_financial_state` singleton upsert is the intended server truth for capital/expenses/menu. Question: should expenses/menu become first-class resources instead of jsonb blobs?
3. Assumption: `beim_receipts.payload` jsonb must stay backward-compatible for restore. Question: what is the oldest backup that must restore cleanly?
4. Assumption: dual users + `gestion_web_access_tokens` bridge stays. Question: single identity model or keep web/gestion separation?
5. Assumption: `BEIM_STORAGE_MODE` local/postgres duality is to be retired in favor of one mode. Question: must local/offline-first operation survive the port?
6. Assumption: receipt state machine (Entregado/Cancelado + payment_status) is complete as observed. Question: are there other `repair_status` values in production data not present in code?

## Ready for Proposal
Yes — proceed to `sdd-propose` for `backend-api-database` with: (a) bounded context split (gestion vs webshop) as first decision, (b) persistence choice (options 1 vs 4) costed, (c) receipt/stock transaction semantics as MUST requirements, (d) the six assumption-questions above posed to the user during proposal review.
