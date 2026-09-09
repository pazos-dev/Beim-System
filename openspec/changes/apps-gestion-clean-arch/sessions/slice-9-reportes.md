# Slice 9: reportes — session brief

Goal: reportes vertical slice over the reports embryo: port → JsonStore adapter → use-case → controller → `useReportesSnapshot`. CSV export stays OUT. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-9-reportes`
Issue: `[clean-arch] slice-9: reportes port, adapter, use-case, useReportesSnapshot`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `tailwind-4` (`~/.config/opencode/skills/tailwind-4/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/reporte*-port.ts`, `adapters/json-reporte*-repository.ts`, `use-cases/reporte*-use-cases.ts`, `controllers/reporte*.ts`, `composition/reportes.composition.ts`, `hooks/useReportesSnapshot.ts`, reportes pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, CSV export code, API handler contracts.

Hooks/adapters: `useReportesSnapshot` (key `['reportes','snapshot',params]`, owns parse+invalidation); `JsonReporteRepository` behind `ReporteRepositoryPort`.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; snapshot round-trip tested
- [ ] Reports embryo types canonicalized in kernel (no duplicates)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Aggregation lives in use-case; hook returns parsed snapshot only
- [ ] Diff ≤400 lines; chained PR with dependency diagram
- [ ] CSV export untouched/absent (explicit OUT confirmed in PR)

Rollback: revert branch; re-point `reportes.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (reporte types), route-table v1.
