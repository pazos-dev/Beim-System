# client-store-layer Specification

## Purpose

Ownership and persistence rules for `apps/gestion` `src/store/`: UI + session-actor state only, versioned theme persistence, ephemeral memory-only state, and selector conventions.

## Requirements

### Requirement: UI and session-actor state only

The system MUST hold only UI and session-actor client state in `src/store/`; it MUST NOT mirror server data (no clientes, ordenes, stock, or other query results).

#### Scenario: Store holds zero server mirrors

- GIVEN the store modules under `src/store/`
- WHEN a grep scans for server entity collections (clientes, ordenes, stock, ventas, compras)
- THEN zero matches exist outside tests

#### Scenario: Server data lives in query hooks

- GIVEN a page needs the clientes list
- WHEN it renders
- THEN data comes from its query hook, not from `src/store/`

### Requirement: Versioned theme persistence surviving logout

The system MUST persist theme in a dedicated slice (`theme.slice.ts`, key `gestion-theme-v1`) with `version`/`migrate`/`partialize`, separate from the session slice, so the theme survives logout.

#### Scenario: Theme survives logout

- GIVEN a stored theme of `oscuro` and a logged-in session actor
- WHEN the user logs out (session actor cleared)
- THEN the stored theme remains `oscuro` on next launch

#### Scenario: Theme storage round-trip

- GIVEN a theme value is set via the theme slice
- WHEN the app reloads and migrates persisted state
- THEN the theme restores to the stored value
- AND unknown stored values fall back to the default

### Requirement: Ephemeral state is memory-only

Ephemeral state (toasts, modals, in-progress filters) MUST be memory-only and MUST NOT be persisted.

#### Scenario: Ephemeral state resets on reload

- GIVEN an open toast and an in-progress filter
- WHEN the app reloads
- THEN toasts, modals, and filters reset to defaults

### Requirement: Selector conventions

Consumers MUST read state via co-located selectors (`selectSessionRole`, `selectPrefsTheme`, `useThemePrefs`); whole-store subscriptions MUST NOT be used.

#### Scenario: Role read via selector

- GIVEN a logged-in actor with role `admin`
- WHEN a component calls `selectSessionRole`
- THEN it receives `admin` without subscribing to unrelated keys
