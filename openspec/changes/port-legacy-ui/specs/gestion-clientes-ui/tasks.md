# Tasks: port-legacy-ui slice — seam + Clientes

**Future target** (specs `gestion-ports-adapters`, `gestion-clientes-ui`; `design.md`, `design-clientes-ui.md`). No app code, no commits. Legacy untouched. `F` base: `apps/gestion/`.

## Preflight

`auto` · `both` · `auto-chain` · `feature-branch-chain` · budget 400 · `pnpm test` · STRICT TDD RED→GREEN.

## Review Workload Forecast

Total ~900–1,100 → mandatory A1 (~300–350) → A2 (~300–350) → B (~300–400); each ≤400; revert B→A2→A1; base `feat/port-legacy-ui`, each PR on previous.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

| Unit | Goal | Test | Harness | Rollback |
|------|------|------|---------|----------|
| A1 | Seam + GET | `pnpm test src/server/use-cases/clientes` | `GET /clientes?q=&page=` seeded | Revert A1 |
| A2 | Mutations | `pnpm test app/api/gestion/clientes` | `POST` + replay same key | Revert A2, GET intact |
| B | UI | `pnpm test app/app/clientes` | `/app/clientes` search + create | Revert B, API intact |

Settled (verify only): `migration/` N/A (no ingestion); `totalItems`=spec "`total`"; 409 (412 future `Api*`); hard-remove=`administrador`+`administrador_principal`; GET incl. 401-negative.

## PR-A1 — Seam + GET

- [x] **CLI-1** — Schema `document`+`active`. **D**:— **O**:`data/schemas.ts` **F**:`src/server/data/schemas.ts`+test **A**:`document` opt 1–40, `active` default true; legacy parses; rollback strips. **T**:unit R→G **V**:`pnpm test` **R**:F
- [x] **CLI-2** — Domain `cliente.ts`. **D**:CLI-1 **O**:`domain/clients/` **F**:`src/lib/domain/clients/cliente.ts`+test **A**:input schema (Zod4 `z.email()`); write roles ven/adm/adm-prin; hard-remove adm/adm-prin; `findDuplicateContact` (email-ci first); `clienteMatchesQuery`. **T**:unit R→G **V**:`pnpm test` **R**:F
- [x] **CLI-3** — Ports actor+cliente. **D**:CLI-2 **O**:`server/ports/` **F**:`src/server/ports/actor.ts`,`src/server/ports/cliente.ts` **A**:`PortActor{id,hasGlobalAccess}`; port list/get/create/update/remove `Result`-typed; no infra imports. **T**:shape R→G **V**:test+typecheck **R**:F
- [x] **CLI-4** — Json adapter+stub+swap suite. **D**:CLI-3 **O**:adapters/test **F**:`src/server/adapters/json-cliente-repository.ts`,`src/test/stub-api-cliente-repository.ts`,shared suite **A**:delegate over `EntityRepository`; suite (CRUD, ownership, OCC, unknown-id NOT_FOUND) passes ×2; existing suite green. **T**:contract ×2 R→G **V**:`pnpm test` **R**:F
- [x] **CLI-5** — List/get use cases+composition+GET routes. **D**:CLI-4 **O**:use-cases/routes **F**:`src/server/use-cases/clientes.ts`,`src/server/composition/clientes.ts`,`app/api/gestion/clientes/route.ts`+`[id]/route.ts` **A**:query q≤120/active/page/pageSize→`{items,page,pageSize,totalItems}`; session auth, 401-negative, forged role ignored; routes import composition/ports only. **T**:use-case+route R→G **V**:`pnpm test` **R**:F
- [x] **CLI-6** — Orders unknown `clienteId`. **D**:CLI-5 **O**:handlers **F**:`src/server/handlers/orders.ts`+test **A**:→`NOT_FOUND_OR_FORBIDDEN` (was VALIDATION_ERROR); no auto-create; draft open. **T**:unit R→G **V**:`pnpm test` **R**:F

## PR-A2 — Mutations

- [x] **CLI-7** — Create/update/remove + POST/PATCH/DELETE. **D**:CLI-5 **O**:use-cases/routes **F**:`use-cases/clientes.ts`, both route files **A**:parse400→role403-no-audit→idempotency(key required; replay cached 1 entry; same-key/diff→409 audited)→audit ok|code; 201 `{cliente,duplicateWarning?}` non-blocking; PATCH stale→409; non-admin DELETE→403; post-write audit fail→AUDIT_FAILURE. **T**:use-case+route R→G **V**:`pnpm test` **R**:F
- [x] **CLI-8** — Error-matrix route tests. **D**:CLI-7 **O**:routes **F**:route tests only **A**:pins 400/401/403/404/409/500 codes; 1 audit entry per executed mutation. **T**:negative R→G **V**:`pnpm test` **R**:F

## PR-B — UI

- [x] **CLI-9** — Table+modal+store. **D**:CLI-7 **O**:features/ui-store **F**:`src/components/features/ClientesTable.tsx`,`ClienteCreateModal.tsx`,`src/lib/ui-store.ts`+RTL **A**:4 cols+role-gated actions; domain-schema validation; per-attempt `x-idempotency-key`; store+=`clienteModalOpen`+`duplicateWarning`; placeholder kept. **T**:RTL R→G **V**:`pnpm test` **R**:F
- [x] **CLI-10** — Page `/app/clientes`. **D**:CLI-9 **O**:page **F**:`app/app/clientes/page.tsx`+test **A**:`useQuery(["clientes",{q,active,page}])`; q debounced 300ms+`router.replace`; warning→row+blocking `alertdialog`+Entendido; success→toast; invalidation; "Ver órdenes"→`/app/ordenes`; loading/empty/error/denied. **T**:RTL R→G **V**:test+typecheck **R**:F

## Gate

- [ ] **CLI-11** — Slice verify (no source changes). **D**:CLI-1…10 **A**:full `pnpm test`+typecheck+`diff --check`; grep routes∉JsonStore; equivalences confirmed; PRs ≤400. **V**:commands **R**:N/A

**Do NOT modify:** legacy, CI, PostgreSQL, deploy/cutover, `ModulePlaceholder.tsx`, shared store modules beyond CLI-1.
