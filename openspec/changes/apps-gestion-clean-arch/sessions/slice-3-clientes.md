# Slice 3: clientes — session brief

Goal: clientes vertical slice: port → JsonStore adapter → use-case → controller → `useClientList`. Behavior unchanged.
Branch: `feat/apps-gestion-clean-arch/slice-3-clientes`
Issue: `[clean-arch] slice-3: clientes port, adapter, use-case, useClientList`

Skills: default + `zod-4` (`~/.config/opencode/skills/zod-4/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`), `vercel-composition-patterns` (`.agents/skills/vercel-composition-patterns/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/cliente*-port.ts`, `adapters/json-cliente*-repository.ts`, `use-cases/cliente*-use-cases.ts`, `controllers/cliente*.ts`, `composition/clientes.composition.ts`, `hooks/useClientList.ts`, clientes pages (import rewiring only).
Forbidden OUT: `src/kernel/**`, `src/store/**`, `src/routes/**`, all other domains, API handler contracts.

Hooks/adapters: `useClientList` (key `['clientes','list',params]`, owns parse+invalidation); `JsonClienteRepository` behind `ClienteRepositoryPort`; binding line `const clienteRepository: ClienteRepositoryPort = new JsonClienteRepository()` is the one-line swap point.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; list/filter round-trip tested
- [ ] Pages import cliente types from kernel only (grep)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Hook owns key factory + parse + invalidation; no generic hook reuse
- [ ] Diff ≤400 lines; chained PR with dependency diagram
- [ ] Swap rule documented in binding file comment (Json → Http one-liner)

Rollback: revert branch; re-point `clientes.composition.ts` binding to old wiring.
Shared contracts: kernel v1 (cliente types), route-table v1.
