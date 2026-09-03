# Proposal: Admin Panel (`apps/gestion`) — MVP Slice 1

## Intent

Replace the legacy vanilla JS `sistema-gestion` SPA (~6300-line monolith in `app.js`) with a typed React admin app. The legacy admin has no types, no component boundaries, and all state in global variables and `localStorage`. This change establishes the new admin shell + auth foundation + first usable CRUD domain.

## Legacy Feature Surface (for reference)

| Module | Description |
|--------|-------------|
| Dashboard | Metrics, recent orders, low stock |
| Orders (OT) | CRUD + status workflow + tech panel + boleta iframe |
| Clients | CRUD |
| Products (Stock) | CRUD + categories, web-to-workshop transfer |
| Sales | Multi-product cart, mixed payment |
| Expenses/Purchases | CRUD + supplier, payment status |
| Services | Service catalog with categories |
| Cash | Daily open/close sessions, variance |
| Reports | Period financials, accounting, treasury, CSV export |
| Settings | Menu config, backups, users/roles/permissions |
| Boleta | Receipt/invoice generation (iframe) |

## Scope — Slice 1 (PR-budgetable MVP)

### In Scope
- `apps/gestion` scaffold: Next.js App Router, Tailwind v4, workspace deps (`@beim/contracts`, `@beim/data`)
- App shell: responsive sidebar + topbar + `<Outlet>` layout
- Login shell: form UI calling `/api/gestion/management-login` (placeholder: session in context, no JWT/cookie persistence yet)
- Dashboard page: metrics panel + recent orders table + low-stock alerts
- Clients CRUD: list, create, edit, delete with table + inline form

### Out of Scope
- Orders management (Slice 2)
- Products/stock CRUD (Slice 3)
- Sales, expenses, services (Slice 4+)
- Cash sessions, reports, accounting (Slice 5+)
- Real auth (JWT/session persistence, role-based route guards) — deferred to dedicated auth slice
- Boleta integration
- Menu settings, backups, user management

## Capabilities

### New Capabilities
- `admin-app-scaffold`: App shell, routing, layout, global styles, workspace wiring
- `admin-auth-shell`: Login form, session context, placeholder auth flow
- `admin-dashboard`: Dashboard with metrics, recent orders, low-stock panel
- `admin-clients-crud`: Clients list, create, edit, delete operations

### Modified Capabilities

None — this is a new app, no existing specs change.

## Approach

- **Framework**: Next.js App Router (matches `apps/web` conventions, Server Components for data-heavy reads via `@beim/data`)
- **Data access**: Server Components call `@beim/data` access layer directly; Client Components use Server Actions or API route handlers
- **Styling**: Tailwind v4 with consistent design tokens (colors, spacing) from `apps/web`
- **State**: React context for auth session; URL-based routing for page state
- **Routing**: `app/(admin)/layout.tsx` shell → nested routes for dashboard, clients, etc.

## Tech Stack Decision

**Next.js App Router** over Vite+React SPA.

Rationale: The data layer (`@beim/data`) is server-oriented Prisma queries. Next.js Server Components let us query data without an extra API translation layer. The web storefront already uses Next.js — consistent tooling, shared config, single deployment target.

## Multi-Slice Plan

| Slice | Content | Dependency |
|-------|---------|------------|
| **1 (this)** | App shell + auth shell + dashboard + clients | — |
| 2 | Orders CRUD + status workflow | Slice 1 |
| 3 | Products/stock + categories + transfers | Slice 1 |
| 4 | Sales + expenses + services | Slice 3 |
| 5 | Cash + reports + accounting | Slice 4 |
| 6 | Settings + users + roles + real auth | Slice 1 |
| 7 | Boleta integration | Slice 2 |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/gestion/` | New | Entirely new Next.js app |
| `turbo.json` | Modified | Add gestion dev/build tasks (auto via workspace) |
| `package.json` (root) | None | No root changes needed |
| `pagina-web/server.js` | None | Existing `/api/gestion/*` routes already serve this |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Scope creep into Slice 2+ | High | Strict IN/OUT table; defer anything not listed |
| Auth placeholder creates tech debt | Low | Document as intentional; dedicated auth slice planned |
| `@beim/data` server-only assumption breaks in Client Components | Low | Use Server Actions pattern; avoid client-side Prisma imports |

## Rollback Plan

Delete `apps/gestion/` directory. No other workspace files are modified (turbo picks up new apps automatically). Zero risk to existing apps.

## Dependencies

- `@beim/contracts`, `@beim/data`, `@beim/domain` — already in workspace
- Existing `/api/gestion/*` routes in `pagina-web/server.js` — already operational
- PostgreSQL with gestion tables — already seeded

## Success Criteria

- [ ] `pnpm dev` serves `apps/gestion` on its own port
- [ ] Sidebar navigation renders all Slice 1 pages
- [ ] Login form calls `/api/gestion/management-login` and stores session in context
- [ ] Dashboard displays metrics from bootstrap API
- [ ] Clients list loads from DB, supports create/edit/delete
- [ ] `pnpm typecheck` passes with zero errors
- [ ] Tests accompany code in same work units

## Proposal Question Round (interrupted — skip for now)

This proposal was generated in full-autopilot mode. Assumptions baked in:
1. MVP slice = app shell + auth shell + dashboard + clients CRUD
2. Next.js App Router chosen for consistency with `apps/web`
3. Real auth deferred (placeholder session in context)
4. Multi-slice plan with 7 slices total
