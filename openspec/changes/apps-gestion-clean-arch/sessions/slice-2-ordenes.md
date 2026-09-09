# Slice 2: ordenes — session brief

Goal: ordenes vertical slice: port → JsonStore adapter → thin use-case → controller → dedicated hooks. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-2-ordenes`
Issue: `[clean-arch] slice-2: ordenes port, adapter, use-cases, hooks`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `vercel-composition-patterns` (`.agents/skills/vercel-composition-patterns/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/orden*-port.ts`, `adapters/json-orden*-repository.ts`, `use-cases/orden*-use-cases.ts`, `controllers/orden*.ts`, `composition/ordenes.composition.ts`, `hooks/useOrders.ts`, `hooks/useOrderDetail.ts`, `hooks/useCreateOrder.ts`, ordenes pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, API handler contracts.

Hooks/adapters: `useOrders` (`['ordenes','list',params]`), `useOrderDetail` (`['ordenes','detail',id]`), `useCreateOrder` (mutation, invalidates `['ordenes']`); `JsonOrdenRepository` behind `OrdenRepositoryPort`.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; list/detail/create round-trips tested
- [ ] Pages import ordenes types from kernel only (grep for server-handler imports)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Each hook owns key factory + parse + invalidation; no shared mega-hook
- [ ] Create invalidates list (stale-list regression test)
- [ ] Diff ≤400 lines; chained PR with dependency diagram

Rollback: revert branch; re-point `ordenes.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (ordenes types), route-table v1 (ordenes paths/roles).
