# Archive Report — contracts

## Status

**ARCHIVED** — SDD cycle complete. Change `contracts` planned, implemented, verified, and archived on branch `feat/contracts`.

## Final State (at close)

- **Verify verdict**: PASS (62/62 vitest tests green across 10 files, `tsc --noEmit` exit 0, turbo build + typecheck no regressions). Verification was completed manually by the orchestrator (the dedicated verify sub-agent was unavailable due to a transient provider endpoint failure); the verbose evidence is in the archived `verify-report.md`.
- **StockMovementType enum**: CORRECT in code (`packages/contracts/src/enums.ts`) and matches legacy reality. Values: `sale | purchase | return | adjustment | sale_annulment | purchase_annulment | web_transfer_out | web_transfer_in | initial_stock | service_order_sale | service_order_return`.
- **Post-verify**: No work beyond the verify-report commit. Everything shipped as of archive.

## Engine / Enum Reconciliation (performed during archive)

An early spec/design draft listed `StockMovementType = sale | purchase | adjustment | return | transfer`, which omits several authoritative legacy values. The legacy source was confirmed by verify:

- `sistema-gestion/app.js` line 4920 label map: `purchase, sale, sale_annulment, purchase_annulment, return, adjustment`
- `pagina-web/server.js` lines 916–917: `web_transfer_out`, `web_transfer_in`
- Plus `initial_stock`, `service_order_sale`, `service_order_return` produced by legacy insert code.

The implemented `StockMovementType` enum **already covered all of these**; only the spec/design *value lists* were stale. During this archive the following files were updated to the correct value set:

| File | Change |
|------|--------|
| `openspec/specs/contracts-schemas/spec.md` | StockMovementType values corrected |
| `openspec/changes/archive/2026-09-03-contracts/specs/contracts-schemas/spec.md` | StockMovementType values corrected |
| `openspec/changes/archive/2026-09-03-contracts/design.md` | StockMovementType values corrected |
| `openspec/specs/contracts-schemas/spec.md` via sync | Delta spec (with correction) synced as the main-line spec |

Note: per `verify-report.md` (archived snapshot, written at verification time), the discrepancy was flagged as a WARNING and recorded as RESOLVED during archive. No CRITICAL issues were ever present.

## Specs Synced

Both `contracts-package` and `contracts-schemas` were NEW capabilities (no prior main-line spec). Their full delta specs (with the enum correction) were mechanically synced as the main-line specs:

| Domain | Action | Details |
|--------|--------|---------|
| `contracts-package` | Created | Full delta spec (Package Identity, Ultra-Strict TS, Barrel Export, Vitest Runner, Source Structure) synced to `openspec/specs/contracts-package/spec.md` |
| `contracts-schemas` | Created | Full delta spec (Entity Schemas, Shared Enums incl. corrected StockMovementType, Shared Enums scenarios, Type Export) synced to `openspec/specs/contracts-schemas/spec.md` |

## Archive Contents

- `proposal.md` ✅
- `specs/contracts-package/spec.md` ✅
- `specs/contracts-schemas/spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (32/32 tasks complete)
- `apply-progress.md` ✅
- `verify-report.md` ✅
- `archive-report.md` ✅ (this file, additive)

## Task Completion Gate

All 32 implementation tasks in `tasks.md` are checked (`[x]`). No stale unchecked tasks. Gate passed without requiring reconciliation.

## Verification Authority

Per the Final-State Authority hierarchy:
- Verify verdict PASS is attested by the archived `verify-report.md` (filesystem).
- The `StockMovementType` code-error claim is resolved (code was correct; only spec/design docs were stale). This is recorded as RESOLVED in the verify snapshot and confirmed by direct inspection of `packages/contracts/src/enums.ts` during archive.
- No CRITICAL issues were present at any point.

## Engram Traceability

Engram observations read for lineage (project `sistema-beim-para-luis`):
- #15 — `sdd/contracts/proposal`
- #16 — `sdd/contracts/spec`
- #17 — `sdd/contracts/design`
- #18 — `sdd/contracts/tasks`
- #22 — `sdd/contracts/apply-progress`

Note: no Engram `sdd/contracts/verify-report` observation exists — verification was performed manually by the orchestrator and persisted only to the filesystem (`openspec/changes/archive/2026-09-03-contracts/verify-report.md`). This is not a gap: verify availability was restored after the provider failure but the filesystem copy is authoritative for `contracts`.

## Mode

hybrid — specs synced and change folder archived on the filesystem; archive-report persisted to both Engram (`sdd/contracts/archive-report`) and the filesystem additively.

## SDK Cycle Complete

`contracts` shipped. Ready for the next change.
