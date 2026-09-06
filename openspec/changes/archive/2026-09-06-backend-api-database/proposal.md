# Proposal: Backend API & Database Port

> **SOLO SPECS**: no code here. Target repo: Beim-System-Tech (deferred, READ-ONLY reference).

## Intent

Legacy backend is split-brain: gestion console treats localStorage as truth (server = opaque backup); `pagina-web/server.js` is a raw `node:http` monolith (~60 routes, Postgres-optional). This change specifies a unified, server-authoritative REST API + persistence model so validation, stock safety, and identity stop being client-side promises.

## Scope

### In Scope
- Bounded-context split first: **gestion** vs **webshop** (share `products`/`beim_receipts`).
- Gestion API: receipts/boleta, sales-batch atomicity, financial-state singleton, stock, cash-sessions, clients, services, purchases, categories.
- Webshop API: auth, users, orders, Stripe checkout, promo-slides, uploads, catalog.
- Persistence costed: REST+Postgres (opt 1) vs hybrid repository ports, files now → Postgres later (opt 4).
- Transactions: `FOR UPDATE` stock guards, annul-restore, payment movements.
- Server-side validation (coercion, required fields, receipt state machine).

### Out of Scope
- Implementation; migration tooling; frontend; realtime; multi-tenant.

## Capabilities

### New Capabilities
- `gestion-api`: management REST resources, `{ ok, data | error }` envelope, server validation, role gating.
- `webshop-api`: storefront REST resources (auth, orders, checkout, catalog, uploads).
- `data-persistence`: repository ports, storage adapters, transaction/stock-safety semantics, schema contract.
- `auth-identity`: dual user model + token bridge, server-side role enforcement.

### Modified Capabilities
- None (`openspec/specs/` is empty).

## Approach

Split contexts first, then cost options 1 vs 4. Recommendation (auto): **option 4** — ports unblock spec velocity and preserve the Postgres swap; option 1 wins only if multi-user stock safety is near-term. Naming: plural nouns, `/api/v1/...`, correct HTTP semantics (api-design-principles).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `Beim-System-Tech/apps/gestion/app/api/gestion/*` | Modified | Add receipts, sales-batch, financial-state |
| `Beim-System-Tech/apps/gestion/data/*.json` | Modified | File adapters now; Postgres later |
| Legacy `db/schema.sql`, `server.js` | Reference | 15-table contract + route inventory |

## Decision Points (non-blocking)

1. Stock safety (`FOR UPDATE`) is MUST; JSON-file oversell risk documented interim.
2. `gestion_financial_state` singleton stays truth; expenses/menu stay jsonb.
3. `beim_receipts.payload` jsonb stays backward-compatible.
4. Dual identity + token bridge retained; unification deferred.
5. `BEIM_STORAGE_MODE` duality retired; offline-first does not survive.
6. Receipt state machine (`Entregado`/`Cancelado` + payment_status) complete as observed.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Client-side validation leaks into spec | Med | RFC 2119 MUSTs for server validation |
| jsonb contracts break restores | Med | Compatibility requirement in data-persistence |
| Auth bridge privilege escalation | Med | Server-side role enforcement |
| Context merge → >400-line review | High | Split gestion/webshop specs first |

## Rollback Plan

Specs-only: delete change folder + Engram topics. No code or data touched.

## Dependencies

- Exploration (`exploration.md`, obs 236); read-only legacy + Beim-System-Tech.

## Success Criteria

- [ ] Contexts split; no cross-context spec file.
- [ ] Options 1 vs 4 costed; recommendation recorded.
- [ ] Receipt/stock transactions specified as MUSTs.
- [ ] Six decision points recorded; none block specs.
