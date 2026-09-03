# Archive Report: domain

**Change**: domain
**Archived**: 2026-09-03
**Branch**: feat/domain
**Mode**: openspec (filesystem) + engram (persistence)

---

## Final State at Close

| Metric | Value | Source |
|--------|-------|--------|
| Verdict | PASS | Orchestrator launch prompt (final-state fact) |
| Tests | 144/144 vitest green | Final-state fact (orchestrator) |
| Typecheck | tsc --noEmit clean | Final-state fact (orchestrator) |
| Scenarios | 59/59 compliant | Final-state fact (orchestrator) |
| Tasks complete | 39/39 | Persisted tasks artifact (inspected at archive time) |
| CRITICAL issues | 0 | Verify-report: verdict PASS, critical_findings: 0 |
| Warnings | 0 | Verify-report: no warnings |

## Native Review Receipt Gate

`reviewGate` is **structurally absent** — receipt-driven development is not enabled for this candidate. No review artifacts exist. Archive proceeds under ordinary repository policy.

## Task Completion Gate

All 39 implementation tasks are checked `[x]` in the persisted `tasks.md`. No stale unchecked tasks detected. Gate: **PASS**.

## Spec Sync

| Domain | Action | Delta Type | Main Spec |
|--------|--------|-----------|-----------|
| domain-package | No merge needed | ADDED (new) | `openspec/specs/domain-package/spec.md` already exists with proper headers |
| domain-order | No merge needed | ADDED (new) | `openspec/specs/domain-order/spec.md` already exists with proper headers |
| domain-payment | No merge needed | ADDED (new) | `openspec/specs/domain-payment/spec.md` already exists with proper headers |
| domain-stock | No merge needed | ADDED (new) | `openspec/specs/domain-stock/spec.md` already exists with proper headers |
| domain-client | No merge needed | ADDED (new) | `openspec/specs/domain-client/spec.md` already exists with proper headers |

All 5 delta specs are `ADDED` only (no MODIFIED, REMOVED, or RENAMED). The main specs were already created with proper headers (`# Domain ... Specification`, `## Purpose`, `## Requirements`) during the sdd-spec phase and synced to `openspec/specs/` earlier. No destructive merges performed.

## Archive Contents

```
openspec/changes/archive/2026-09-03-domain/
├── apply-progress.md
├── design.md
├── proposal.md
├── specs/
│   ├── domain-client/spec.md
│   ├── domain-order/spec.md
│   ├── domain-package/spec.md
│   ├── domain-payment/spec.md
│   └── domain-stock/spec.md
├── tasks.md
└── verify-report.md
```

## Mechanical Copy Verification

- Snapshot created at: `/tmp/sdd-archive.7PNDgK/source`
- Move command: `git mv openspec/changes/domain openspec/changes/archive/2026-09-03-domain`
- `diff -r` readback: **empty diff, exit code 0** — byte-identical

## Source of Truth

The following main specs reflect the shipped behavior:
- `openspec/specs/domain-package/spec.md`
- `openspec/specs/domain-order/spec.md`
- `openspec/specs/domain-payment/spec.md`
- `openspec/specs/domain-stock/spec.md`
- `openspec/specs/domain-client/spec.md`

## Implementation Summary

The `domain` change bootstrapped `@beim/domain` as a pure TypeScript package exporting 5 domain modules:

1. **DomainError** — base error class with typed error codes
2. **Order** — service-items normalization, calculation (totals + technical base budget), status state machine, repair status derivation
3. **Payment** — status normalization (gestion vocabulary), stock commitment guard, stock deductions, annulment processing
4. **Stock** — sufficiency validation, movement computation, weighted-average cost, purchase validation, transfer with paired movements
5. **Client** — name validation, default resolution, document normalization, field defaults

All functions are pure (no `Date.now()`, no `crypto.*`; timestamps injected). Only dependency: `@beim/contracts` (type-only import).

## Engram Observation IDs

| Artifact | Observation ID |
|----------|---------------|
| proposal | (persisted via sdd-propose) |
| spec | (persisted via sdd-spec) |
| design | (persisted via sdd-design) |
| tasks | (persisted via sdd-tasks) |
| apply-progress | (persisted via sdd-apply) |
| verify-report | (persisted via sdd-verify) |

## Deviations from Design (Documented at Verification Time)

Per `verify-report.md` (intermediate snapshot, verification time):
- Transfer reference ID derived from `now` or pure key (no `crypto.randomUUID()` in domain)
- `createStockMovement` returns `StockMovementInput` (no `id`/`createdAt` — data layer assigns)
- `balanceAfter` in transfer movements set to `0` placeholder (data layer computes actual)

All three are intentional purity trade-offs, documented in `apply-progress.md`. None break spec requirements.

## Intentional Archive Flags

None. Clean archive — all tasks complete, zero CRITICAL/WARNING, no partial archive overrides.
