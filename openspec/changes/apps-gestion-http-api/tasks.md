# Tasks: apps-gestion HTTP API (Bearer session + HTTP clientes)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 850–1050 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | feature-branch-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Config + fetch + entry gate | PR1 | `pnpm --filter gestion exec vitest run src/lib/http/api-config.test.ts` | N/A — offline only, no live backend | Delete `src/lib/http/api-config.ts`, `src/lib/http/api-fetch.ts` |
| 2 | Session token + 401 death | PR1 | `pnpm --filter gestion exec vitest run src/store/session.slice.test.ts` | N/A — storage inspection only | Revert `src/store/session.slice.ts`, `src/hooks/useSession.ts` |
| 3 | Http adapter + composition | PR2 | `pnpm --filter gestion exec vitest run src/lib/http/http-cliente-repository.test.ts` | N/A — recorded fixtures only | Re-point `src/lib/http/clientes.composition.ts` to `JsonClienteRepository` |
| 4 | Client hooks + invalidation | PR3 | `pnpm --filter gestion exec vitest run src/hooks/useClientList.test.ts` | N/A — jsdom + recorded fetch | Delete `src/hooks/useClient*.ts`, restore prior imports |

## Phase 1: Entry Gate + Foundation

- [x] 1.1 Record connection gate in `openspec/changes/apps-gestion-http-api/tasks.md`: apply/verify WAIT for user `BEIM_API_BASE_URL`, test credentials; no live calls until provided.
- [x] 1.2 Create `src/lib/http/api-config.ts` with `resolveApiBaseUrl()`, `joinApiPath()`; sole env reader.
- [x] 1.3 Create `src/lib/http/api-fetch.ts` with Bearer injection, 401 session death, `ApiError` (`network|parse|server`).
- [x] 1.4 Create `src/lib/http/api-config.test.ts`: trailing-slash, default URL, join-helper cases.

### Connection Gate (PR1 — recorded 2026-09-09)

User-verified dev values; OFFLINE ONLY (zero sockets, no servers, no live backend):

- Base default `http://localhost:4000` + `/api/v1` join (unit-tested, no double prefix).
- Bearer token in memory only; `gestion-login`/`logout` shapes per fixtures.
- Envelope `ok`/`data|error`; strict 422 surfaces typed errors.
- OPERATOR = {vendedor, tecnico, caja, administrador, administrador_principal};
  ADMIN = {administrador, administrador_principal}. Mapping sign-off: RESOLVED
  (verified backend contract).
- PR1 fixtures delivered: `login.json`, `logout.json`, `errors/401.json`,
  `recorded-fetch.ts` stub. Clientes/error fixtures remain for later PRs.

## Phase 2: Session Slice + Auth Hooks

- [x] 2.1 Modify `src/store/session.slice.ts`: add memory-only `token`, `setSession(actor,token)`, `clearSession()`; no `persist`.
- [x] 2.2 Modify `src/hooks/useSession.ts`, `src/hooks/useBootstrap.ts`: Bearer login/logout via `api-fetch`, invalidate `['bootstrap']` on settle.
- [x] 2.3 Verify 401 death in `src/hooks/useSession.test.ts`: 401 fixture clears actor+token, routes to login.

## Phase 3: Adapter + Composition

- [x] 3.1 Create `src/lib/http/http-cliente-repository.ts`: implement `ClienteRepositoryPort` (list/detail/create/update) with zod parse.
- [x] 3.2 Create `src/lib/http/clientes.composition.ts`: bind `HttpClienteRepository`; keep `JsonClienteRepository` import as rollback.
- [x] 3.3 Checkpoint: get reviewer sign-off on OPERATOR/ADMIN→kernel-role mapping before wiring create (OPERATOR-only).

## Phase 4: Client Hooks

- [ ] 4.1 Create `src/hooks/useClientList.ts`, `src/hooks/useClientDetail.ts`: frozen keys `['clientes','list',params]`, `['clientes','detail',id]`; clamp `limit` to 100.
- [ ] 4.2 Create `src/hooks/useCreateCliente.ts`, `src/hooks/useUpdateCliente.ts`: `onSettled` invalidates `['clientes']`.
- [ ] 4.3 Modify `src/routes/RouteGate.tsx`, `src/routes/route-table.ts`: wire 404→not-found, 403→access-denied only.

## Phase 5: Fixtures + Suites

- [ ] 5.1 Create `src/test/fixtures/http/` (`login.json`, `logout.json`, `clientes-list*.json`, `cliente-detail.json`, `cliente-create-201.json`, `cliente-update.json`, `errors/*.json`) incl. search-ILIKE + active true/false/all variants explicitly.
- [ ] 5.2 Create `src/test/fixtures/http/recorded-fetch.ts`: `fetchImpl` stub asserting zero sockets.
- [ ] 5.3 Create suites `src/lib/http/*.test.ts`, `src/hooks/useClient*.test.ts`: cover 422 unknown-key no-cache-mutation, malformed parse error, 404/403 matrix, no-persist storage inspection, zero-socket assert.
- [ ] 5.4 Add grep gates: one env reader, zero `fetch(` outside `api-fetch`/tests, zero `persist` in session slice, zero `localhost:4000` literals outside config.

## Phase 6: Gate Wiring + Verify

- [ ] 6.1 Wire `findRoute` → `RouteGate` mapping per spec; assert no fetch fires on 403 denial.
- [ ] 6.2 Run `pnpm --filter gestion exec tsc --noEmit` and full offline `vitest run`; record focused commands + results.
