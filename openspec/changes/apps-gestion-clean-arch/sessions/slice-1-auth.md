# Slice 1: auth — session brief

Goal: auth vertical slice over kernel v1: session use-case + controller, `useBootstrap` hook, route gating enforced from the table. Remove the `Role` shim.
Branch: `feat/apps-gestion-clean-arch/slice-1-auth`
Issue: `[clean-arch] slice-1: auth session slice, bootstrap hook, route gating`

Skills: default + `nextjs-15` (`~/.config/opencode/skills/nextjs-15/SKILL.md`), `react-19` (`~/.config/opencode/skills/react-19/SKILL.md`), `frontend-design` (`.agents/skills/frontend-design/SKILL.md`), `tanstack-query-best-practices` (`.agents/skills/tanstack-query-best-practices/SKILL.md`).

Allowed IN: `apps/gestion/src/server/ports/auth-*.ts`, `adapters/json-auth-*.ts`, `use-cases/auth-*.ts`, `controllers/auth-*.ts`, `composition/auth.composition.ts`, `hooks/useBootstrap.ts`, session slice edits, `src/routes/**` (gating only).
Forbidden OUT: `src/kernel/**`, `src/store/theme.slice.ts`, all other domains, API handler contracts (composition wiring only).

Hooks/adapters: `useBootstrap` (key `['bootstrap']`, owns parse+invalidation); `JsonAuthRepository` behind `AuthRepositoryPort`; binding line in `auth.composition.ts` is the only backend choice.

Acceptance:
- [ ] `pnpm typecheck` + `pnpm test` green; login/logout/bootstrap round-trip tested
- [ ] `Role` shim removed; zero page→server-handler imports (grep)
- [ ] Gating denies unauthed/unauthorized routes per table (negative test included)
- [ ] No `JsonStore`/fetch imports outside `adapters/` + `composition/` (grep checklist)
- [ ] Diff ≤400 lines; chained PR on slice-0 branch with dependency diagram
- [ ] Prefs survive logout (theme persists; session slice holds no persisted prefs)

Rollback: revert branch; re-point `auth.composition.ts` to pre-slice wiring; restore shim if needed.
Shared contracts: kernel v1, theme slice v1, route-table v1.
