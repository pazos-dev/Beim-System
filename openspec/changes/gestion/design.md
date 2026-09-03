# Design: Admin Panel (apps/gestion) — MVP Slice 1

## Technical Approach

Replace the legacy `sistema-gestion` SPA with a typed Next.js App Router app. Server Components handle reads via `@beim/data`; Server Actions handle writes (create/edit/delete). TanStack Query manages client-side state for mutations and cache invalidation. Auth is a placeholder session in React Context (explicitly deferred to a later slice).

Maps to proposal capabilities: `admin-app-scaffold`, `admin-auth-shell`, `admin-dashboard`, `admin-clients-crud`. Specs: `gestion-scaffold` + `gestion-clients`.

## Architecture Decisions

| # | Decision | Chosen | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Framework | Next.js App Router | Vite + React SPA | Server Components for direct `@beim/data` reads without API translation layer. Consistent with `apps/web`. Single deployment target. |
| 2 | Client state | TanStack Query | useState + manual fetch | CRUD forms + mutations + cache invalidation after writes need automatic stale management. TanStack Query handles revalidation, optimistic updates, and query keys. ~11 KB. |
| 3 | Mutations | Server Actions | Route handlers `/api/*` | Single file import, typed end-to-end, no manual fetch/JSON. Route handlers add translation layer for no benefit. |
| 4 | Delete strategy | Soft delete (add `active` field) | Hard delete via `deleteClient` | Schema has no `active` field. Clients have FK references from orders/receipts in production. Soft delete preserves referential integrity. Requires schema migration (safe additive column). |
| 5 | Auth shell | React Context mock session | localStorage flag or API mock | Context is SSR-safe, no flash of wrong state, clear TODO boundary for real auth slice. Cannot be mistaken for security. |

## Data Flow

### Reads (Server Components)

    Browser ──GET──> Next.js Route ──> Server Component ──> @beim/data ──> Prisma ──> PostgreSQL
                                                                          (listClients, getClientById)

### Writes (Server Actions)

    Client Component ──useFormState──> Server Action ──> validate(@beim/contracts) ──> @beim/data ──> Prisma ──> PostgreSQL
                                         │                                                          (upsertClient, softDeleteClient)
                                         └── revalidatePath("/gestion/clients") ──> TanStack invalidateQueries

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/gestion/package.json` | Create | Package manifest: next, react, tailwind, @beim/*, tanstack-query, vitest |
| `apps/gestion/tsconfig.json` | Create | Extends `@beim/tsconfig/react.json`, Next.js plugins, path aliases |
| `apps/gestion/next.config.mjs` | Create | `transpilePackages: ['@beim/contracts', '@beim/domain', '@beim/data']` |
| `apps/gestion/tailwind.config.ts` | Create | Shared tokens: teal, navy, pro-ink, Inter/Manrope (mirrors apps/web) |
| `apps/gestion/postcss.config.mjs` | Create | `@tailwindcss/postcss` plugin |
| `apps/gestion/eslint.config.mjs` | Create | Flat config matching apps/web pattern |
| `apps/gestion/.env.example` | Create | `DATABASE_URL="postgresql://..."` |
| `apps/gestion/vitest.config.ts` | Create | jsdom, react plugin, @ alias |
| `apps/gestion/vitest.setup.ts` | Create | jest-dom + cleanup |
| `apps/gestion/app/globals.css` | Create | Tailwind v4 `@import` + `@theme` tokens (same palette as apps/web) |
| `apps/gestion/app/layout.tsx` | Create | Root html/body, React Query provider, AuthProvider wrapper |
| `apps/gestion/app/not-found.tsx` | Create | 404 page styled with shared tokens |
| `apps/gestion/app/loading.tsx` | Create | Spinner consistent with apps/web loading state |
| `apps/gestion/app/(admin)/layout.tsx` | Create | Sidebar nav (Dashboard, Clients) + topbar + Outlet. Server Component. |
| `apps/gestion/app/(admin)/page.tsx` | Create | Dashboard: metrics cards + recent orders + low-stock. Server Component with `runtime = 'nodejs'`. |
| `apps/gestion/app/(admin)/clients/page.tsx` | Create | Clients list + search + create/edit form. Client Component (interactive). |
| `apps/gestion/app/(admin)/clients/[id]/page.tsx` | Create | Client detail view. Server Component with `runtime = 'nodejs'`. |
| `apps/gestion/app/login/page.tsx` | Create | Login form, posts to `/api/gestion/management-login`, sets mock session in context |
| `apps/gestion/lib/providers.tsx` | Create | QueryClientProvider + AuthProvider composed wrapper |
| `apps/gestion/lib/auth-context.tsx` | Create | React Context for mock session (type, provider, useAuth hook) |
| `apps/gestion/lib/actions/client.ts` | Create | Server Actions: createClient, updateClient, deleteClient (soft) |
| `apps/gestion/components/sidebar.tsx` | Create | Nav sidebar component with active-route highlighting |
| `apps/gestion/components/topbar.tsx` | Create | Top bar with page title, search, actions |
| `apps/gestion/components/client-form.tsx` | Create | Create/edit client form component |
| `apps/gestion/components/client-table.tsx` | Create | Clients table with row actions |
| `apps/gestion/components/confirm-dialog.tsx` | Create | Reusable confirmation modal for delete |
| `apps/gestion/lib/__tests__/client-form.test.tsx` | Create | Unit: form validation, submit handler, error display |
| `apps/gestion/lib/__tests__/client-table.test.tsx` | Create | Unit: renders rows, search filtering, empty state |
| `apps/gestion/lib/__tests__/actions.test.ts` | Create | Unit: server action validation (mocked @beim/data) |
| `packages/data/prisma/schema.prisma` | Modify | Add `active Boolean @default(true)` to GestionClient |
| `packages/data/src/access/client.ts` | Modify | Add `softDeleteClient(id)`, filter `listClients` to `active: true` |
| `packages/data/src/index.ts` | Modify | Export `softDeleteClient` |
| `packages/data/src/mapper/client.ts` | Modify | Include `active` field in contract mapping |
| `packages/contracts/src/client.ts` | Modify | Add `active: z.boolean()` to clientSchema |

## Interfaces / Contracts

### Updated Client Contract

```typescript
export const clientSchema = z.object({
  id: z.string(),
  name: z.string(),
  document: z.string().exactOptional(),
  phone: z.string().exactOptional(),
  email: z.string().exactOptional(),
  active: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})
```

### Soft Delete Data Access

```typescript
// packages/data/src/access/client.ts
export async function softDeleteClient(id: string): Promise<Client> {
  const updated = await prisma.gestionClient.update({
    where: { id },
    data: { active: false },
  })
  return toClientContract(updated)
}
```

### Server Actions Interface

```typescript
// apps/gestion/lib/actions/client.ts
"use server"
export async function createClient(formData: FormData): Promise<{ error?: string }>
export async function updateClient(id: string, formData: FormData): Promise<{ error?: string }>
export async function deleteClient(id: string): Promise<{ error?: string }>
```

### Auth Context Shape

```typescript
interface MockSession {
  username: string
  name: string
  role: "administrador"
}
// Provider wraps children; useAuth() returns { session, login, logout }
// login() calls /api/gestion/management-login, stores MockSession in state
// NO real security claims; marked as TODO for auth slice
```

## Styling

- Tailwind v4 with `@theme` tokens identical to `apps/web`: teal (#0c9f92), navy (#17374b), pro-ink (#152236), pro-muted (#66748a), pro-line (#dce6ea).
- Fonts: Inter (body), Manrope (headings).
- Admin-specific additions to globals.css: sidebar colors (navy gradient), panel shadows, metric card accents.
- Legacy admin tokens from `sistema-gestion/styles.css` and `ux.css` mapped to Tailwind utility equivalents (not CSS custom properties).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Client form validation (zod schema), server action error paths, table rendering with mock data | Vitest + @testing-library/react, `vi.mock('@beim/data')` |
| Integration | Server Actions calling mocked @beim/data | Vitest with vi.mock for data layer |
| E2E | Deferred to later slice | Playwright not included in this change |

No live DB in tests. All data layer calls mocked. Build/typecheck gate enforced.

## Threat Matrix

N/A — no routing boundaries, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process-integration changes. App Router navigation is client-side SPA routing, not a system-level routing boundary.

## Migration / Rollout

Schema migration: add `active Boolean @default(true)` to `GestionClient`. Safe additive column — existing rows get `active = true` automatically. No data loss. Requires `prisma migrate dev` before app runs.

No feature flags needed. No phased rollout — delete the legacy `sistema-gestion` directory when the new app is confirmed working (separate change, not in this slice).

## Open Questions

- [ ] Does the `gestion_clients` table have FK references from other tables (orders, receipts)? If yes, hard delete is impossible and soft delete is correct. If no, hard delete could be revisited in a later slice.
- [ ] Should the dashboard bootstrap metrics come from `@beim/data` access functions or from the existing `/api/gestion` endpoints in `pagina-web/server.js`? Recommendation: use `@beim/data` directly for consistency, but the dashboard spec says "metrics from bootstrap API" — clarify with maintainer.
