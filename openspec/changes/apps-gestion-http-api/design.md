# Design: apps-gestion HTTP API (Bearer session + HTTP clientes)

## Technical Approach

Bind `apps/gestion` to the live Express 5 backend (`/api/v1`) with zero observable behavior change. A single config module resolves the base URL, a single fetch wrapper injects the in-memory Bearer token and handles 401 session death, the session slice gains a memory-only token, and `HttpClienteRepository` implements the frozen `ClienteRepositoryPort` over HTTP. Hooks mirror the slice-2 ordenes precedent (one owner per key, zod parse, targeted invalidation). All tests run offline against recorded fixtures. Bearer transport SUPERSEDES the slice-1 JsonStore-era transport (cookie session, `/api/gestion/**` same-origin fetch); slice-1 gate/store rules (single writer, theme survives logout, UI-only gate) are kept unchanged.

```
useLogin/useLogout ──settle──→ invalidate ['bootstrap'] ──→ useBootstrap GET {base}/bootstrap (Bearer)
        │                              │
        └── useSessionSync (SOLE writer) → session.slice { actor, token } (memory-only)
                                                    │ getState() read
api-fetch (sole injection point) ←── Authorization: Bearer <token> ── HttpClienteRepository ── ClienteRepositoryPort
        │ 401 → clearSession + invalidate + redirect /login
page → findRoute → RouteGate(route, role) → children | not-found (404/no-identity) | access-denied (403)
theme.slice (gestion-theme-v1) ── untouched by logout
```

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Base URL via `NEXT_PUBLIC_BEIM_API_BASE_URL` in one config module vs per-hook env reads | Per-hook reads drift and duplicate trailing-slash bugs | Single `src/lib/http/api-config.ts`: `resolveApiBaseUrl()` trims, strips trailing `/`, defaults `http://localhost:4000/api/v1`; `joinApiPath()` joins. No other module touches env. |
| Header injection in one `api-fetch` wrapper vs per-adapter headers | Per-adapter headers leak 401 handling into every call site | `src/lib/http/api-fetch.ts` is the sole HTTP exit: reads token via `useSessionStore.getState()` (no subscription), attaches `Authorization`, maps 401 to session death (clear + redirect). Mirrors server `HttpAuditRepository` `{baseUrl, token, fetchImpl}` pattern. |
| Token in session slice vs separate token store | Separate store splits identity/token writes and risks desync | Extend `session.slice.ts` with `token: string \| null`, `setSession(actor, token)`, `clearSession()`; still no `persist` middleware. Single-writer rule kept: only `useSessionSync` calls them outside tests. |
| `useBootstrap` owns `['bootstrap']`, session slice owns identity vs merging | Merging reintroduces the slice-1 dual-writer bug (stale actor resurrection) | Keep split: `useBootstrap` sole owner of key/fetch/parse; `useSessionSync` sole writer of the slice; login/logout invalidate `['bootstrap']` on settle. |
| Client `HttpClienteRepository` on the frozen port vs new parallel interface | New interface orphans the port contract and its tests | `src/lib/http/http-cliente-repository.ts` implements `ClienteRepositoryPort` via `api-fetch` + zod; bound once in `src/lib/http/clientes.composition.ts` (auth.composition precedent). `JsonClienteRepository` untouched (removal OUT). |
| Recorded fixtures vs live-backend/MSW-server tests | Live backend breaks hermetic CI; MSW still needs socket discipline | `src/test/fixtures/http/` JSON fixtures + `fetchImpl` stub asserting zero sockets (api-console-session precedent). |

## Data Flow

Login `POST {base}/auth/gestion-login` returns `{ token, expiresAt, user }` → `setSession` holds token in memory. Every adapter call carries `Authorization: Bearer <token>`. `POST {base}/auth/logout` returns `{ loggedOut: true }` → `clearSession` on settle (success or 401) + invalidate `['bootstrap']`; theme prefs survive. Any 401 → session death: clear, invalidate, route to login, never render stale data. Gate mapping: backend 404 on gestion scope (no identity, deliberate hide) → not-found/login; 403 (wrong role) → access-denied, no fetch fires.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/lib/http/api-config.ts` | Create | `resolveApiBaseUrl()`, `joinApiPath()`; sole env reader |
| `src/lib/http/api-fetch.ts` | Create | Bearer injection + 401 interceptor + `ApiError` (network/parse/server kinds) |
| `src/lib/http/http-cliente-repository.ts` | Create | Port implementation; method↔endpoint map + zod schemas below |
| `src/lib/http/clientes.composition.ts` | Create | `const repo: ClienteRepositoryPort = new HttpClienteRepository(...)`; sole client backend choice |
| `src/hooks/useClientList.ts`, `useClientDetail.ts` | Create | Key factories, owned fetch/parse; `limit` clamp 100 |
| `src/hooks/useCreateCliente.ts`, `useUpdateCliente.ts` | Create | Mutations; `onSettled` invalidates `['clientes']` |
| `src/store/session.slice.ts` | Modify | Add memory-only `token`, `setSession`/`clearSession`; no persist |
| `src/hooks/useSession.ts`, `useBootstrap.ts` | Modify | Bearer login/logout, 401 clearing; fetch via `api-fetch`; keys unchanged |
| `src/routes/RouteGate.tsx`, `route-table.ts` | Modify | 404→not-found, 403→access-denied wiring only; matrix values unchanged |
| `src/test/fixtures/http/**` + `recorded-fetch.ts` | Create | Fixture layout below; zero-socket stub |
| `src/lib/http/*.test.ts`, `src/hooks/useClient*.test.*` | Create | Adapter, hook, gate-matrix, no-persist tests |

## Interfaces / Contracts

```ts
// const-types pattern; flat interfaces; no any
export const CLIENTE_KEY_ROOT = "clientes" as const;
export const clientesListKey = (p: ClienteListParams) => ["clientes", "list", p] as const;
export const clientesDetailKey = (id: string) => ["clientes", "detail", id] as const;
export interface ClienteListParams { readonly search?: string; readonly active?: boolean; readonly page: number; readonly limit: number; }
```

| Port method | Endpoint | Success | Errors |
|---|---|---|---|
| `list` | `GET /clients?search&active&page&limit` | `{ ok:true, data:{ items, total, page, limit } }` | 422→validation (no cache change), 401→auth-required, 403→forbidden, 404→not-found-or-forbidden |
| `getById` | `GET /clients/:id` | `{ ok:true, data }` | same map |
| `create` (OPERATOR) | `POST /clients` → 201 `data` | created cliente | unknown-key 422 surfaces typed error, cache untouched |
| `update` | `PUT /clients/:id` | updated cliente | same map; version conflict→conflict |

Envelope: unwrap `{ ok:true, data }`, surface `{ ok:false, error }` as typed errors. Parse failures are distinct from network errors (`ApiError.kind`: `network | parse | server`).

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Adapter round-trip list/detail/create/update vs fixtures; corrupt JSON→typed parse error; 422 unknown-key→no cache mutation | `fetchImpl` stub + seed fixtures; no network |
| Hook (jsdom) | Key equality (`['clientes','list',params]`, `['clientes','detail','c-1']`); create settle invalidates `['clientes']`, N→N+1 refetch; limit 500→100 | `query-client.tsx` harness + recorded fetch |
| Session (jsdom) | Login sets actor+token; reload/storage has no token; logout clears + theme `oscuro` survives; 401 clears + gates to login | Storage inspection + 401 fixture |
| UI (jsdom) | 404 fixture→not-found/login; 403 fixture→access-denied, no fetch | Gate matrix tests |
| Grep gates | One env reader (`api-config`); zero `fetch(` outside `api-fetch`/tests; zero `persist` in session slice; zero `localhost:4000` literals outside config | CI checklist |

Fixture layout: `src/test/fixtures/http/{login.json, logout.json, clientes-list.json, cliente-detail.json, cliente-create-201.json, cliente-update.json, errors/{422-unknown-key.json, 401.json, 403.json, 404.json, malformed-list.json}}`, all shaped from the verified contract. Suites assert zero open sockets.

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. In-app `RouteGate` rendering is UI-only data (slice-1 precedent); enforcement stays server-side. 404/403 mapping is covered by gate-matrix RED tests, not by new threat tasks.

## Migration / Rollout

Client-only, no backend or data migration. 1. Land config + `api-fetch` + session token + adapters + hooks behind existing gates. 2. Gates: typecheck/test green, grep checklist, offline suites. 3. Chained PR ≤400 lines. Rollback: revert branch; composition re-points to `JsonClienteRepository`; no data touched. `JsonStore` removal explicitly OUT (later per-slice deletions). `apps/api/**` untouched.

## Open Questions

- None blocking. OPERATOR/ADMIN→kernel-role mapping values need reviewer sign-off in tasks phase.
