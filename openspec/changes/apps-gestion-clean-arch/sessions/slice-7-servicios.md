# Slice 7: servicios — session brief

Goal: servicios vertical slice: port → JsonStore adapter → use-case → controller → `useServicios`. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-7-servicios`
Issue: `[clean-arch] slice-7: servicios port, adapter, use-case, useServicios`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `vercel-composition-patterns` (`.agents/skills/vercel-composition-patterns/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/servicio*-port.ts`, `adapters/json-servicio*-repository.ts`, `use-cases/servicio*-use-cases.ts`, `controllers/servicio*.ts`, `composition/servicios.composition.ts`, `hooks/useServicios.ts`, servicios pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, API handler contracts.

Hooks/adapters: `useServicios` (key `['servicios','list',params]`, owns parse+invalidation); `JsonServicioRepository` behind `ServicioRepositoryPort`.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; list/schedule round-trip tested
- [ ] Pages import servicio types from kernel only (grep)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Scheduling logic lives in use-case, not in components/hooks
- [ ] Diff ≤400 lines; chained PR with dependency diagram
- [ ] No server mirrors added to Zustand

Rollback: revert branch; re-point `servicios.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (servicio types), route-table v1.
