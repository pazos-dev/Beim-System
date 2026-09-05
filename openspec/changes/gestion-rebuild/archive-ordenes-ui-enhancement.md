# Archive Report: ordenes-ui-enhancement (slice of change `gestion-rebuild`)

- Status: archived (slice closure; parent change `gestion-rebuild` remains active)
- Date: 2026-09-05
- Branch: `feat/gestion-rebuild` (no commit, no push, no PR from archive)
- Artifact store: hybrid (`both`)
- Verdict at close: **pass_with_warnings, 0 blockers, 0 CRITICAL**

## Final State (authoritative at close)

Per the orchestrator's Archive Final-State Handoff (highest-ranked source after the
persisted tasks artifact) plus the persisted tasks file:

- Tasks ORD-UI.1 through ORD-UI.9 are DONE in
  `openspec/changes/gestion-rebuild/specs/ordenes-list/tasks.md`
  (0 unchecked boxes; Task Completion Gate: PASS, verified with
  `grep -c -- "- [ ]"` returning 0 matches).
- Apply fixed 8 typecheck errors; `apps/gestion/data/audit.json` runtime noise was
  reverted; no commit/push/PR was performed.
- Slice verification (after apply-progress): 12 requirements / 30 scenarios met
  (list 4/10, filter 4/12, iframe 4/8). Fresh evidence cited in handoff:
  `pnpm test` 48 files / 216 tests green (exit 0), `pnpm typecheck` clean (exit 0),
  `git diff --check` clean (exit 0). Archive re-checked `git diff --check` (exit 0)
  and confirmed `sistema-gestion/`, `pagina-web/`, and CI paths have no status entries.
- Verify edited no code (read + tests only). No regressions. `GR-ORDERS.*` stays closed
  (not reopened). Legacy, CI, PostgreSQL, deployment, and cutover untouched.

Snapshot attribution: per `verify-report` #208 (at verification time, 2026-09-05
14:02 UTC) the verdict was pass_with_warnings with the two warnings and two
suggestions below; per `apply-progress` #207 (at apply time, 2026-09-05 13:59 UTC)
the 8 typecheck fixes and audit.json revert had already landed. Both snapshots are
history; the handoff facts above are the state at close.

## Residual Warnings (accepted, non-blocking)

- W1 (cosmetic deviation): invalid `?estado=` falls back to the `en_diagnostico`
  filter correctly but does not `router.replace` the URL, so the spec scenario
  "redirects to /ordenes?estado=en_diagnostico" is functionally met without URL rewrite.
- W2 (review budget): 808 tracked insertions plus untracked vendored/tests exceed the
  400-line budget; the slice chains as a new PR with `size:exception` under the
  cached `auto-chain` / `feature-branch-chain` strategy (review_budget 400).
- S1 (cosmetic): `OrdersTable` passes `visibleRowLimit={items.length}` instead of
  `{pageSize}`; equivalent because `items.length <= pageSize`, no rows are cut.
- S2 (hardening): `orderListViewQuerySchema` uses `z.custom` for `estado` without
  refinement, so invalid keys pass route parsing and are rejected downstream in
  `handler.listView` (400 `VALIDATION_ERROR`, covered by `orders-routes.test.ts`);
  tighten with `refine` for fail-fast at the route in a follow-up.

## Documented Open Questions (from canonical design, unchanged at close)

- The spec title says "12 states to 8 filters" but the normative table defines
  11 states to 9 filters (including "Todas"); the table governs and was followed.
- `boletaNumero` is assumed to be an optional order field with no feature flag
  (design D1/D9); no additional flag was added.

## Specs Synced (Step 2, mechanical copy with `diff -r` readback)

`openspec/specs/` was empty before this archive, so each delta spec was promoted as
a new main spec (no merge into existing content, nothing destructive):

| Domain | Action | Details |
|--------|--------|---------|
| ordenes-list | Created `openspec/specs/ordenes-list/spec.md` | Byte-identical copy of change delta (4 requirements / 10 scenarios) |
| ordenes-state-filter | Created `openspec/specs/ordenes-state-filter/spec.md` | Byte-identical copy of change delta (4 requirements / 12 scenarios) |
| ordenes-create-iframe | Created `openspec/specs/ordenes-create-iframe/spec.md` | Byte-identical copy of change delta (4 requirements / 8 scenarios) |

All `diff -r` readbacks were empty (only passing evidence; verbatim output is in
the phase result).

## Archive Move (Step 3, intentionally scoped)

The full change folder `openspec/changes/gestion-rebuild/` was NOT moved to
`openspec/changes/archive/`. Reason: this archive closes only the
`ordenes-ui-enhancement` slice; the parent change still holds 9 other capability
specs (`gestion-*`) and its GR-* tracker, and the branch is explicitly kept ready
to chain as a new PR (`size:exception`, `auto-chain`). Moving the parent folder now
would prematurely close active work. The parent `verify-report.md` (GR-* scope) was
left untouched per the orchestrator's constraint. This file plus the Engram
`archive-report` observation form the slice audit trail.

## Traceability

- Engram observations read in full: #203 (`sdd/ordenes-ui-enhancement/proposal`),
  #204 (`sdd/ordenes-ui-enhancement/spec`), #205 (`sdd/ordenes-ui-enhancement/design`),
  #206 (`sdd/ordenes-ui-enhancement/tasks`), #207
  (`sdd/ordenes-ui-enhancement/apply-progress`), #208
  (`sdd/ordenes-ui-enhancement/verify-report`). Project: `beim-system`.
- OpenSpec artifacts: `openspec/changes/gestion-rebuild/specs/ordenes-list/tasks.md`
  (9/9 DONE), `openspec/changes/gestion-rebuild/design-ordenes-ui.md` (145 lines),
  three delta specs listed above, and the untouched parent
  `openspec/changes/gestion-rebuild/verify-report.md` (GR-* scope).

## Verification Checklist

- [x] Main specs created via mechanical copy, `diff -r` empty
- [x] Slice `tasks.md` has no unchecked implementation tasks (9/9 DONE)
- [x] `verify-report` has 0 CRITICAL findings (pass_with_warnings accepted)
- [x] Parent change folder intentionally left active (slice scope, documented above)
- [x] Parent `verify-report.md` (GR-*) untouched
- [x] `git diff --check` clean; legacy (`sistema-gestion/`, `pagina-web/`) and CI intact
- [x] No commit / push / PR performed from archive

## Next

Tree is ready to chain as a new PR with `size:exception` (`auto-chain`): no code work
remains for this slice. Do not modify legacy, CI, PostgreSQL, deployment, or cutover.
