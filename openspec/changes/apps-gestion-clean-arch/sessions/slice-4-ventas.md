# Slice 4: ventas — session brief

Goal: ventas vertical slice: port → JsonStore adapter → use-case → controller → `useVentas`. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-4-ventas`
Issue: `[clean-arch] slice-4: ventas port, adapter, use-case, useVentas`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `vercel-composition-patterns` (`.agents/skills/vercel-composition-patterns/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/venta*-port.ts`, `adapters/json-venta*-repository.ts`, `use-cases/venta*-use-cases.ts`, `controllers/venta*.ts`, `composition/ventas.composition.ts`, `hooks/useVentas.ts`, ventas pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, API handler contracts.

Hooks/adapters: `useVentas` (key `['ventas','list',params]`, owns parse+invalidation); `JsonVentaRepository` behind `VentaRepositoryPort`.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; list/total round-trip tested
- [ ] Pages import venta types from kernel only (grep)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Totals derived server-side via use-case, not computed in components
- [ ] Diff ≤400 lines; chained PR with dependency diagram
- [ ] No server mirrors added to Zustand (grep store for venta list state)

Rollback: revert branch; re-point `ventas.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (venta types), route-table v1.
