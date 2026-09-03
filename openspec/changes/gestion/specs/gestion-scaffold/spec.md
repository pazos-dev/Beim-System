# Delta for gestion-scaffold

## ADDED Requirements

### Requirement: Admin App Package Structure

`apps/gestion` SHALL be a standalone workspace package named `@beim/gestion` with `tsconfig.json` extending `@beim/tsconfig/react.json`, a `next.config` with `transpilePackages: ['@beim/contracts', '@beim/domain', '@beim/data']`, and Tailwind v4 using the shared color/spacing tokens from `apps/web`.

#### Scenario: Package resolves in workspace

- GIVEN `apps/gestion/package.json` declares `"name": "@beim/gestion"`
- WHEN `pnpm install` runs from workspace root
- THEN `@beim/gestion` resolves as a workspace symlink in `node_modules`

#### Scenario: Shares storefront design tokens

- GIVEN `apps/gestion` Tailwind config references the shared BEIM tokens (teal, navy, pro-ink, Inter/Manrope)
- WHEN a component applies `className="...pro-ink"` or a heading class
- THEN the rendered output uses the same palette as `apps/web`

### Requirement: Admin App Shell with Sidebar Navigation

The app SHALL render a persistent shell layout (`app/(admin)/layout.tsx`) with a responsive sidebar and topbar. The sidebar SHALL list navigation entries for Dashboard and Clients, with routing via the App Router nested routes.

#### Scenario: Sidebar renders navigation

- GIVEN the admin app is running and a user is on the dashboard route
- WHEN the layout renders
- THEN the sidebar shows links to "Dashboard" and "Clientes" (Clients)
- AND each link navigates to its corresponding nested route

#### Scenario: Shell wraps child routes

- GIVEN a nested page under the admin layout
- WHEN the page renders
- THEN the topbar and sidebar persist across page navigation
- AND child route content renders in the main content area

### Requirement: Auth Shell with Placeholder Session

The app SHALL expose a login page with username/password form that posts to `/api/gestion/management-login`. On a successful placeholder response, the app SHALL store a mock session in React context so the admin app loads. Real auth (JWT/cookie persistence, role guards) is explicitly out of scope for this slice.

#### Scenario: Login stores placeholder session

- GIVEN a user submits valid credentials to the login form
- WHEN the placeholder `/api/gestion/management-login` call returns success
- THEN a session object is set in React context
- AND the app navigates to the dashboard

#### Scenario: Failed login shows error

- GIVEN a user submits credentials and the placeholder endpoint rejects
- WHEN the login form is submitted
- THEN an inline error message is shown
- AND no session is stored in context

### Requirement: Admin Route Runtime

All routes that import from `@beim/data` (Prisma client) SHALL set `export const runtime = 'nodejs'`.

#### Scenario: Prisma-backed route runs on Node

- GIVEN a route imports data-access functions from `@beim/data`
- WHEN the route exports `runtime = 'nodejs'`
- THEN Next.js serves the route on the Node.js runtime without Prisma client errors

### Requirement: Build and Quality Scripts

`apps/gestion/package.json` SHALL expose `dev`, `build`, `typecheck`, and `lint` scripts. `pnpm typecheck` SHALL pass with zero errors.

#### Scenario: Typecheck passes

- GIVEN `apps/gestion` source files are valid ultra-strict TypeScript
- WHEN `pnpm typecheck --filter @beim/gestion` runs
- THEN tsc exits 0 with no errors

#### Scenario: Production build succeeds

- GIVEN `apps/gestion` source files are valid
- WHEN `pnpm build --filter @beim/gestion` runs
- THEN `.next/` is produced with exit code 0

### Requirement: Baseline Smoke Test

The app SHALL include at least one test verifying the admin shell renders without crashing.

#### Scenario: Shell smoke test passes

- GIVEN `apps/gestion` has a smoke test for the shell layout
- WHEN `pnpm test --filter @beim/gestion` runs
- THEN the test passes with exit code 0

### Requirement: Dashboard with Metrics and Alerts

The dashboard page SHALL display metric counts and summary data sourced from `@beim/data`, rendered via Server Components. It SHALL show metrics (e.g., client count), recent orders table, and a low-stock alerts panel when such data is available.

#### Scenario: Dashboard renders metrics

- GIVEN clients and orders exist in the data layer
- WHEN the dashboard route renders
- THEN metric counts are displayed from `@beim/data`
- AND the recent orders table and low-stock panel render

#### Scenario: Empty data renders gracefully

- GIVEN no clients or orders exist in the data layer
- WHEN the dashboard route renders
- THEN the page renders with empty-state placeholders instead of throwing

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
