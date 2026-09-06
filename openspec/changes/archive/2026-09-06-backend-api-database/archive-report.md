# Archive Report — backend-api-database

**Archive date**: 2026-09-06
**Archived to**: `openspec/changes/archive/2026-09-06-backend-api-database/`
**Artifact store**: openspec (file-based). All artifacts read from filesystem paths (no Engram observation IDs apply to this store).
**Verdict at close**: PASS WITH WARNINGS (verify-report, evidence revision `sha256:0ae010ec9e3b68830f256bc9a3049bacd8a35b057ef040f99fc9e10a0ae62887`), CRITICAL 0, blockers 0, archivable.

## Final State (per orchestrator launch prompt — outranks intermediate snapshots)

- 144/144 tests green (Vitest, 12 files, `fileParallelism: false`).
- Typecheck clean (`pnpm --filter @beim/api typecheck`, exit 0) and build clean (`tsc` exit 0).
- `db:migrate` idempotent: 21 tables (19 vendored + 2 migration), seed not duplicated across re-applies.
- 17/17 scenarios traced compliant (16 literal + S12 adjudicated COMPLIANT under REVISION 2026-09-05, recorded as W1).
- Commits: 4b60893 (PR 1-2 scaffold + error system + persistence core), 07e6079 (PR 3 gestion module), 67748dc (PR 4 webshop module), 26629de (collateral), 10bf63f (verification evidence).

Per `apply-progress.md`, the final test counts progressed 60 → 104 → 144 across work units; per launch prompt, the terminal count is 144/144 — the highest-ranked source, carried here.

## Task Completion Gate

Task gate passed without reconciliation: the persisted `tasks.md` shows 22/22 checkboxes `[x]`, 0 unchecked (verified in the archived artifact). `sdd-apply` completed its checkbox work; no archive-time stale-checkbox reconciliation was needed.

## Baseline Spec Locations (source of truth updated)

Delta specs were synced into the system spec baseline at the following locations (all **Created**, no pre-existing main specs for these domains; no merge into existing requirements was required):

| Domain | Baseline path | Action | Requirements |
|--------|---------------|--------|--------------|
| auth-identity | `openspec/specs/auth-identity/spec.md` | Created | 2 (Dual model + token bridge; Server-side role enforcement) |
| data-persistence | `openspec/specs/data-persistence/spec.md` | Created | 3 (Ports + adapters; Transaction + stock safety; Idempotent schema migration — decision-applied) |
| gestion-api | `openspec/specs/gestion-api/spec.md` | Created | 3 (Envelope + server validation; Receipt/sales-batch atomicity; Financial-state singleton + cash sessions) |
| webshop-api | `openspec/specs/webshop-api/spec.md` | Created | 2 (Catalog/orders/checkout; Promo-slides/uploads) |

The four delta specs (`openspec/changes/.../specs/{domain}/spec.md`) contained full requirement blocks, not ADDED/MODIFIED/REMOVED delta sections; per the orchestrator instruction, the baselines were written as production-equivalent specs in the repo's STANDARD slice format (the `openspec/specs/` convention: `# Especificación: {domain}`, `## Propósito`, `## Requisitos`, `### Requisito:`, `#### Escenario:` with Dado/Cuando/Entonces, Estado/Contrato/Prueba rows, neutral technical Spanish — matching the existing `ordenes-*` baselines and `config.yaml` rules). The verbatim English delta originals remain untouched in the archived change folder as the audit trail. All requirements and scenarios from the deltas are preserved 1:1; each requirement is labeled **Línea base observada (Observed baseline)** per the repo's root `spec.md` label convention (implemented and verified in this checkout; the gestion-rebuild baselines use "Objetivo futuro" only because that apply produced docs without code).

## Warnings Carried Forward (follow-ups, not blockers)

- **W1 — Adapter-swap scenario superseded (data-persistence)**: the delta's GIVEN premise "file adapters" does not hold; REVISION 2026-09-05 delivers Postgres from day one (pg raw, ports + pg adapters). The THEN-clause (endpoints keep request/response contracts) is satisfied and verified via the contract suite. The baseline records the scenario with the premise explicitly marked superseded. No re-verification needed: it is a documented deviation, not a CRITICAL.
- **W2 — `resolveIdentity` not wired in production boot**: `server.ts` boots `createApp()` without `resolveIdentity` (per `src/app.ts`), so gestion `/api/v1` routes return fail-closed 404 in production until the resolver lands. Mechanism proven (403 path tested); no security exposure. **Track as follow-up, not part of this archive.** Baseline text reflects the injectable-identity design (`resolveIdentity` option) without claiming production wiring.

## Drift Resolved During Sync (documented decisions applied)

1. **REVISION 2026-09-05** (user stack decisions, design.md): Postgres from day one + Express 5 + TS strict + pg raw + zod; app at `apps/api`; gestion module untouched; modular monolith; typed error taxonomy with `{ ok, data | error }` envelope and ERROR_CODES 401/403/404/409/415/422/500/503 (+413 for the upload size cap, per S3). Applied to all four baselines.
2. **Migration semantics**: vendored 19-table `schema.sql` + `seed.sql` applied idempotently (IF NOT EXISTS / ON CONFLICT), then `migrations/*.sql` per filename order — migration 0001 adds `published` (products, promo_slides) and creates `webshop_sessions` + `checkout_sessions`; 21 tables total. Encoded as a dedicated data-persistence requirement (`Migración idempotente del esquema`).
3. **Published-flag decision (PR 4)**: explicit `published boolean not null default true`, independent of stock (out-of-stock stays visible, unpublished → 404/absent) and of badge. Applied to webshop-api catalog requirement + scenario note.
4. **One-pending-session rule (PR 4)**: a single pending `checkout_sessions` row per order; second mint → 409; paid order → 409; payment stays `pending` until webhook. Applied to webshop-api checkout requirement + added scenario.
5. **Storage mappings (verify-report S2, confirmed in code)**: services → `app_settings` jsonb (`gestion.services.<uuid>`); purchases → `audit_logs`; cash movements → `audit_logs` action `cash.movement`; stock movements → `audit_logs` action `stock.movement`. Applied to gestion-api atomicity requirement.
6. **Table-count attribution drift**: `verify-report` names the two migration tables as `webshop_sessions` + `gestion_web_access_tokens`, but direct verification of `apps/api/src/db/schema.sql` (19 CREATE TABLE, **including** `gestion_web_access_tokens`) and `migrations/0001-webshop-auth-catalog.sql` shows the migration-created tables are `webshop_sessions` + `checkout_sessions`. Total (21 = 19 + 2) matches the launch prompt; the baseline and this report state the verified attribution.
7. **413 PAYLOAD_TOO_LARGE** (verify-report S3): present in ERROR_CODES but absent from the canonical list; the launch prompt's canonical map is 401/403/404/409/415/422/500/503. Recorded here; upload size cap (413) documented in webshop-api baseline.
8. **tasks.md archive status**: the repo's tasks.md format has no archive-status field (checkboxes only), so no update was required; the archived tasks.md retains 22/22 `[x]` as the completion record.

## Verification of the Mechanical Archive Move

The change folder was moved with a snapshot + `git mv` transaction (fallback guard refused unless the source stayed byte-identical to the pre-move snapshot). The MANDATORY `diff -r` readback (pre-move recursive snapshot vs. archived destination) produced:

```
diff -r: no differences (empty output) — PASS
```

Empty output is the only passing evidence; the archive-report.md is additive and excluded from the comparison (it did not exist in the source snapshot). Active changes directory no longer contains `backend-api-database`. No files were committed (git index carries only the staged rename; baseline specs are untracked additions, per "Do NOT commit").

## Audit Trail Integrity

- Archived folder contains: proposal.md, exploration.md, HANDOFF.md (superseded note preserved), design.md (with REVISION), specs/{auth-identity,data-persistence,gestion-api,webshop-api}/spec.md, tasks.md (22/22), apply-progress.md, verify-report.md.
- No CRITICAL findings existed at archive time; no intentional partial archive was requested; no stale unchecked tasks were reconciled.