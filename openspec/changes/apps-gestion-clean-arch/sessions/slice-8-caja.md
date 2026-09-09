# Slice 8: caja — session brief

Goal: caja vertical slice over the cash embryo: port → JsonStore adapter → use-case → controller → `useCajaEstado`. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-8-caja`
Issue: `[clean-arch] slice-8: caja port, adapter, use-case, useCajaEstado`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `vercel-composition-patterns` (`.agents/skills/vercel-composition-patterns/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/caja-*.ts`, `adapters/json-caja-*.ts`, `use-cases/caja-*.ts`, `controllers/caja*.ts`, `composition/caja.composition.ts`, `hooks/useCajaEstado.ts`, caja pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, API handler contracts.

Hooks/adapters: `useCajaEstado` (key `['caja','estado']`, owns parse+invalidation); `JsonCajaRepository` behind `CajaRepositoryPort`.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; open/close/estado round-trips tested
- [ ] Cash embryo types canonicalized in kernel (no duplicate caja types)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Balance computed in use-case, never in components
- [ ] Diff ≤400 lines; chained PR with dependency diagram
- [ ] No server mirrors added to Zustand

Rollback: revert branch; re-point `caja.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (caja types), route-table v1.
