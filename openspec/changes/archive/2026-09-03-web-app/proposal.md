# Proposal: Web App (Next.js Storefront) — MVP Host Slice

## Intent

Replace the legacy vanilla storefront (`pagina-web/index.html` + `script.js` + `server.js`) with a typed Next.js 14+ App Router app (`apps/web`) consuming `@beim/contracts`, `@beim/domain`, `@beim/data`. This is a MULTI-SLICE migration; this change delivers the **first MVP slice**: the app host shell + catalog browsing (home listing, category filter, product detail) reading from PostgreSQL via the existing `@beim/data` access layer.

## Scope

### In Scope
- `apps/web` scaffold: Next.js App Router, Tailwind, workspace wiring, tsconfig `extends @beim/tsconfig/react.json`.
- Root layout shell (header/nav/footer) using `@beim/contracts` Category + Product types.
- Home catalog listing + category navigation (Server Components over `@beim/data`).
- Product detail route (`/producto/[id]`).
- Data flow established from `@beim/data` → typed presentation.

### Out of Scope (deferred follow-ups)
- Shopping cart / checkout / payment / WhatsApp order.
- Auth (email / Google / Facebook), orders history, profile.
- Admin panel + product/category edit, boleta/receipt flow (`pagina-web/boleta/`).
- Search, hero/slides, wholesale section, stock polling.
- Deleting/removing any legacy `pagina-web/` code.

## Capabilities

### New Capabilities
- `web-app-scaffold`: Next.js app shell, workspace + tsconfig wiring, dev/build/typecheck.
- `storefront-catalog`: catalog listing, category filtering, product detail (read-only over `@beim/data`).

### Modified Capabilities
None.

## Approach

- Next.js 14+ App Router; React Server Components for catalog data reads (`listProducts`, `listCategories`, `getProductById` from `@beim/data`).
- Tailwind for styling; data resolved on server (no TanStack Query needed this slice — static RSC).
- Workspace deps `@beim/contracts`, `@beim/domain`, `@beim/data` (`workspace:*`); tsconfig `extends react.json`.
- Env: self-hosted PostgreSQL via `DATABASE_URL`; Prisma client from `@beim/data`.
- Routes: `/` (home), `/categoria/[id]` (filter), `/producto/[id]` (detail), `/layout.tsx` shell.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/*` | New | Next.js storefront app scaffold + routes |
| `pnpm-workspace.yaml` | Modified | Registers `apps/web` (glob already present) |
| `packages/tsconfig/react.json` | Modified (if needed) | Add Next-specific compiler options |
| `openspec/specs/*` | New | `web-app-scaffold`, `storefront-catalog` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RSC + Prisma misconfig (Node runtime) | Med | Force `runtime = 'nodejs'` on data routes |
| App exceeds 400-line PR budget | Med | Chain: scaffold PR → catalog PR |
| Image/asset path breaks | Low | Reuse seed images; fallback placeholder |

## Rollback Plan

Safe — new orthogonal `apps/web`; nothing legacy deleted. Rollback = revert the `web-app` branch / delete `apps/web`. Legacy `pagina-web` remains untouched and serving.

## Dependencies

- `@beim/contracts`, `@beim/domain`, `@beim/data` (already merged).
- PostgreSQL available via `DATABASE_URL`; `prisma generate` run in `@beim/data`.

## Success Criteria

- [ ] `pnpm dev` boots `apps/web` and `/` renders seeded catalog from PostgreSQL.
- [ ] Category filter and `/producto/[id]` render typed data from `@beim/data`.
- [ ] `pnpm typecheck` + `pnpm build` pass under ultra-strict TS.
- [ ] Legacy `pagina-web` still runs; zero legacy files removed.

## Assumptions

- Self-hosted PostgreSQL via `DATABASE_URL`; product catalog is source data from seed.
- Server-rendered catalog is the correct MVP (no client hydration needed yet).
- This is slice 1 of N; follow-ups will chain separately (cart, auth, checkout, admin, boleta).
