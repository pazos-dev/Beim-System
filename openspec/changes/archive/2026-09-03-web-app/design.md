# Design: Web App (Next.js Storefront) — MVP Host Slice

## Technical Approach

Add a new `apps/web` Next.js App Router storefront that reads the seeded catalog through `@beim/data` Server Components (RSC). The app is a thin presentation shell over the existing typed access layer — `@beim/data` already returns `@beim/contracts` `Product`/`Category` types via async access fns (`listProducts`, `listCategories`, `getProductById`), so no in-app mapping is needed. Deliver two capabilities: `web-app-scaffold` (host shell + tooling) and `storefront-catalog` (listing/filter/detail). Legacy `pagina-web` stays untouched; rollback = revert branch / delete `apps/web`.

## Architecture Decisions

### ADR-1: Server Components direct data access vs route handlers

| Option | Tradeoff | Decision |
|--------|----------|----------|
| RSC direct-call `@beim/data` | One hop, end-to-end types, no extra HTTP round trip; matches proposal. | **Choose** |
| Route handlers (app/api) + client fetch | Adds HTTP hop + serialization; needed only when client-side caching/hydration required | Reject this slice |

**Choice**: Server Components call `listProducts`/`listCategories`/`getProductById` directly. **Rationale**: read-only catalog, no client mutation, `@beim/data` returns contracts synchronously to the RSC boundary; avoids duplicating an API surface Prisma already provides through the access layer.

### ADR-2: Include TanStack Query this slice?

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Exclude TanStack Query | Fewer deps; static RSC needs no caching/hydration now | **Choose** |
| Include now | Adds client runtime + provider before any client feature exists | Reject |

**Choice**: NOT included. **Rationale**: all data is server-rendered static RSC; cart/search/auth slices later introduce client interactivity that will justify TanStack Query. Add then, not now.

### ADR-3: Node runtime for Prisma routes

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Force `export const runtime = 'nodejs'` | Prisma needs Node (DB driver, no Edge); explicit + safe | **Choose** |
| Default Edge | Prisma client errors at request time | Reject |

**Choice**: Every route importing `@beim/data` exports `runtime = 'nodejs'`. **Rationale**: PrismaClient requires Node.js runtime; Edge default breaks any querying route.

## Data Flow

```
          Server Component (app/layout.tsx, page.tsx)
                       │ listCategories()/listProducts()/getProductById()
                       ▼
        @beim/data  access/  (async, returns contracts)
                       │  prisma.product.findMany/findUnique
                       ▼
              Prisma → PostgreSQL (DATABASE_URL)
                       ▲ no further mapping in app; contracts typed via @beim/contracts
```

- Empty catalog → home renders empty-state; `getProductById` null → `notFound()` (404).
- Routes never import Prisma/client directly — only `@beim/data`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/package.json` | Create | `@beim/web`, deps: `next`, `react`, `react-dom`, `@beim/contracts`/`domain`/`data` (`workspace:*`), `tailwindcss`; scripts dev/build/typecheck/lint/test |
| `apps/web/tsconfig.json` | Create | extends `@beim/tsconfig/react.json` + Next-specific (`next-env.d.ts`, JSX, paths) |
| `apps/web/next.config.mjs` | Create | `transpilePackages: ['@beim/contracts','@beim/domain','@beim/data']` |
| `apps/web/tailwind.config.ts` | Create | theme tokens teal `#0c9f92`, navy `#17374b`, Inter+Manrope |
| `apps/web/app/globals.css` | Create | Tailwind directives + font face |
| `apps/web/app/layout.tsx` | Create | root shell header(nav+`listCategories`)+footer, `runtime='nodejs'` |
| `apps/web/app/page.tsx` | Create | home catalog grid via `listProducts`, empty-state |
| `apps/web/app/not-found.tsx` | Create | 404 page |
| `apps/web/app/loading.tsx` | Create | loading fallback |
| `apps/web/app/categoria/[id]/page.tsx` | Create | filtered via `listProducts(id)`, `getCategoryById` |
| `apps/web/app/producto/[id]/page.tsx` | Create | detail via `getProductById`, null→notFound() |
| `apps/web/components/*` | Create | `ProductCard`, `ProductGrid`, `CategoryNav` (presentational, typed) |
| `apps/web/lib/` | Create | pure helpers (price/currency format) |
| `apps/web/app/page.test.tsx` / helpers | Create | unit smoke tests (mock `@beim/data`) |
| `apps/web/.env.example` | Create | `DATABASE_URL` |
| `apps/web/vitest.config.ts` | Create | vitest + react testing env |

## Interfaces / Contracts

```ts
// Data flows already-typed contracts into RSC; no app-level mapping.
import { listProducts, listCategories, getProductById } from '@beim/data'
import type { Product, Category } from '@beim/contracts'

// app/producto/[id]/page.tsx
export const runtime = 'nodejs'
export default async function Page({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id)
  if (!product) notFound()
  // render product: Product
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | pure format helpers; ProductCard/CategoryNav render | vitest + @testing-library/react; mock `@beim/data` module |
| Build/quality | typecheck, lint, build | main gate; Next production build (`pnpm build`) |
| Integration/E2E | Playwright browser flows | **Deferred to later slice** (note in tasks) |

Any test that would touch Prisma mocks `@beim/data` — no live DB in unit layer.

## Threat Matrix

`N/A` — no shell command, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Web routes here are HTTP application routes, not those boundaries; all rows not applicable.

## Migration / Rollout

No data migration — reads existing seeded PostgreSQL via `DATABASE_URL`; `prisma generate` runs in `@beim/data`. New orthogonal `apps/web`; nothing legacy removed.

## Open Questions

- None blocking; minor: confirm Inter/Manrope delivery (Google Fonts `next/font` vs self-hosted) in apply.
