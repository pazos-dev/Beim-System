# Bearer Session Specification

## Purpose

Bearer-token session for `apps/gestion` against `POST /api/v1/auth/gestion-login` and `POST /api/v1/auth/logout`. Token lives in memory only, rides every request as `Authorization: Bearer <token>`, and drives bootstrap plus route gates. Theme prefs survive logout.

## Requirements

### Requirement: Login stores the token in memory only

The system MUST authenticate via `POST /api/v1/auth/gestion-login`, MUST hold the returned token in memory (Zustand session slice or equivalent), and MUST NOT persist it to `localStorage`, `sessionStorage`, cookies, or any serializable store.

#### Scenario: Login round-trip

- GIVEN valid gestion credentials
- WHEN login succeeds with `{ token, expiresAt, user }`
- THEN the actor (`id`, `username`, `name`, `role`) is set and the token is held in memory.

#### Scenario: Token never touches persistent storage

- GIVEN a completed login
- WHEN the app reloads or storage is inspected
- THEN no token exists in `localStorage`, `sessionStorage`, or cookies, and the actor starts cleared.

### Requirement: Logout clears the session and preserves prefs

The system MUST call `POST /api/v1/auth/logout`, MUST clear token and actor on settle (success or 401), MUST invalidate `['bootstrap']`, and MUST NOT clear the `gestion-theme-v1` prefs slice.

#### Scenario: Logout round-trip

- GIVEN a logged-in actor
- WHEN logout returns `{ loggedOut: true }`
- THEN token and actor are cleared and `['bootstrap']` refetches to the logged-out state.

#### Scenario: Theme survives logout

- GIVEN stored theme `oscuro` and a logged-in actor
- WHEN logout completes
- THEN gated routes deny access and theme remains `oscuro`.

### Requirement: Every HTTP call carries the Bearer header

The system MUST attach `Authorization: Bearer <token>` to every backend request while logged in, and MUST treat a 401 response as session death: clear token and actor, then route to login.

#### Scenario: Header attached

- GIVEN a logged-in session with token `abc`
- WHEN any API request fires
- THEN its headers include `Authorization: Bearer abc`.

#### Scenario: Expired token recovers to login

- GIVEN a stale token and a 401 response
- WHEN the 401 is observed
- THEN token and actor are cleared and the UI gates to login without leaking prior data.

### Requirement: No-identity renders not-found, wrong-role renders access-denied

The system MUST render not-found/login when no identity resolves (backend 404 on gestion scope: deliberate hide) and MUST render access-denied when the role lacks permission (backend 403). Gates MUST NOT distinguish nonexistent from forbidden beyond this mapping.

#### Scenario: No identity hides the route

- GIVEN no resolved gestion identity
- WHEN a gated path renders
- THEN the UI shows not-found/login, never protected content.

#### Scenario: Wrong role is denied explicitly

- GIVEN an authenticated actor with a non-permitted role (e.g. `vendedor` on `/app/caja`)
- WHEN the gated path renders
- THEN the UI shows access-denied and no data fetch fires.

### Requirement: Session tests use recorded fixtures, never a live backend

The system MUST cover this spec with recorded fixtures shaped from the contract (`{ token, expiresAt, user }`, `{ loggedOut: true }`, envelope errors). Tests MUST NOT open sockets or require `localhost:4000`.

#### Scenario: Fixture login/logout round-trip

- GIVEN recorded login plus logout fixtures
- WHEN the session suite runs offline
- THEN login sets the actor, logout clears it, and zero network connections open.

#### Scenario: Fixture 404/403 matrix

- GIVEN recorded 404 (no identity) and 403 (wrong role) fixtures
- WHEN gate tests run
- THEN 404 maps to not-found/login and 403 maps to access-denied.
