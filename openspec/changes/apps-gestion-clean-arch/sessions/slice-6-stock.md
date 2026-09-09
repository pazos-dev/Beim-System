# Slice 6: stock — session brief

Goal: stock vertical slice over the inventory embryo: port → JsonStore adapter → use-case → controller → `useProductList`, `useStockLevels`, `useStockMovements`. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-6-stock`
Issue: `[clean-arch] slice-6: stock port, adapter, use-cases, product/stock hooks`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `vercel-composition-patterns` (`.agents/skills/vercel-composition-patterns/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/stock-*.ts` (+ product port), `adapters/json-stock-*.ts`, `use-cases/stock-*.ts`, `controllers/stock*.ts`, `composition/stock.composition.ts`, `hooks/useProductList.ts`, `hooks/useStockLevels.ts`, `hooks/useStockMovements.ts`, stock pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, API handler contracts.

Hooks/adapters: `useProductList` (`['productos','list',params]`), `useStockLevels` (`['stock','levels']`), `useStockMovements` (`['stock','movements',params]`); `JsonStockRepository` behind `StockRepositoryPort`.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; levels/movements round-trips tested
- [ ] Inventory embryo types canonicalized in kernel (no duplicate product types)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Three hooks, three key factories; no shared mega-hook
- [ ] Diff ≤400 lines; chained PR with dependency diagram
- [ ] No server mirrors added to Zustand

Rollback: revert branch; re-point `stock.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (product/stock types), route-table v1.
