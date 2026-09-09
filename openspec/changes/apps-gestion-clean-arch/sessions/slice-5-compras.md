# Slice 5: compras — session brief

Goal: compras vertical slice: port → JsonStore adapter → use-case → controller → `useCompras`. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-5-compras`
Issue: `[clean-arch] slice-5: compras port, adapter, use-case, useCompras`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `vercel-composition-patterns` (`.agents/skills/vercel-composition-patterns/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/compra*-port.ts`, `adapters/json-compra*-repository.ts`, `use-cases/compra*-use-cases.ts`, `controllers/compra*.ts`, `composition/compras.composition.ts`, `hooks/useCompras.ts`, compras pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, API handler contracts.

Hooks/adapters: `useCompras` (key `['compras','list',params]`, owns parse+invalidation); `JsonCompraRepository` behind `CompraRepositoryPort`.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; list/create round-trip tested
- [ ] Pages import compra types from kernel only (grep)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Mutation invalidates `['compras']` (stale-list regression test)
- [ ] Diff ≤400 lines; chained PR with dependency diagram
- [ ] No server mirrors added to Zustand

Rollback: revert branch; re-point `compras.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (compra types), route-table v1.
