# Slice 0: kernel + store + routes-shell — session brief

Goal: land `src/kernel/` (types/errors/Result/`Role`), `src/store/` (session, versioned theme, UI slices), and `src/routes/` table + AppShell/Sidebar layout. Unblocks slices 1–9.
Branch: `feat/apps-gestion-clean-arch/slice-0-kernel-store-routes`
Issue: `[clean-arch] slice-0: kernel, store, routes table, shell layout`

Skills: default (`solid`, `api-design-principles`, `error-handling-patterns`) + `typescript`, `zustand-5`, `nextjs-15`, `react-19` (all `~/.config/opencode/skills/<name>/SKILL.md`).

Allowed IN: `apps/gestion/src/kernel/**`, `apps/gestion/src/store/**` (incl. `theme.slice.ts`, persist `gestion-theme-v1`), `apps/gestion/src/routes/**`, `AppShell.tsx`, `features/Sidebar.tsx` (composition only), `Role` re-export shim.
Forbidden OUT: every `src/server/**` except `composition/*` wiring for the shim; all domain hooks/adapters/use-cases; `pagina-web/`, `sistema-gestion/`; API handler contracts (frozen).

Hooks/adapters: none (foundation only). Theme slice: `useThemePrefs` selector + `selectPrefsTheme`; session slice exposes `selectSessionRole`.

Acceptance:
- [ ] `pnpm typecheck` green in `apps/gestion` (shim keeps old `Role` imports compiling)
- [ ] `pnpm test` green; theme persist round-trip test (version/migrate/partialize)
- [ ] No page imports from server handlers (grep); store holds zero server mirrors
- [ ] Route table covers all current paths with roles+labels; sidebar renders from table
- [ ] Diff ≤400 lines; chained PR targets tracker branch with dependency diagram
- [ ] Adapter grep checklist N/A (no adapters yet) — recorded as such in PR

Rollback: revert slice-0 commits; shim restores old `Role` path; pages untouched.
Shared contracts: kernel v1 (`Role`, `Result`, errors) — slices 1–9 consume by name, never redefine.
