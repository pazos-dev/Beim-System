# web-app-scaffold Specification

## Purpose

Next.js 14+ App Router storefront shell in `apps/web` — workspace wiring, build tooling, layout, routes, and baseline verification. This is the host package that future slices (cart, auth, checkout) will extend.

## Requirements

### Requirement: App Package Structure

`apps/web` SHALL be a standalone workspace package with `package.json` (name `@beim/web`), `tsconfig.json` extending `@beim/tsconfig/react.json`, and Tailwind CSS configured for utility styling.

#### Scenario: Package resolves in workspace

- GIVEN `apps/web/package.json` exists with `"name": "@beim/web"`
- WHEN `pnpm install` runs from workspace root
- THEN `@beim/web` resolves without errors
- AND `node_modules/@beim/web` is a symlink to `apps/web`

#### Scenario: TypeScript extends shared config

- GIVEN `apps/web/tsconfig.json` extends `@beim/tsconfig/react.json`
- WHEN `pnpm typecheck --filter @beim/web` runs
- THEN ultra-strict checks (noUncheckedIndexedAccess, exactOptionalPropertyTypes) are enforced

### Requirement: Next.js App Router Configuration

The app SHALL use Next.js 14+ App Router with `app/` directory routing. `next.config` SHALL exist at `apps/web/next.config.mjs` (or `.ts`).

#### Scenario: Dev server starts

- GIVEN `apps/web` is installed and configured
- WHEN `pnpm dev --filter @beim/web` runs
- THEN Next.js dev server starts on a local port
- AND `http://localhost:{port}` returns an HTTP 200 response

### Requirement: App Shell Layout

Root layout (`app/layout.tsx`) SHALL render a persistent shell with header (BEIM brand + nav) and footer, wrapping all child routes. Shell components SHALL use types from `@beim/contracts`.

#### Scenario: Layout renders on home page

- GIVEN the app is running in development
- WHEN a user navigates to `/`
- THEN the page includes a header with BEIM branding
- AND the page includes a footer
- AND the layout wraps the page content

### Requirement: Workspace Dependencies

`apps/web/package.json` SHALL declare `@beim/contracts`, `@beim/domain`, and `@beim/data` as `"workspace:*"` dependencies.

#### Scenario: Data layer is importable

- GIVEN `apps/web` declares `@beim/data` as workspace dependency
- WHEN a Server Component imports `listProducts` from `@beim/data`
- THEN the import resolves to the local workspace package

### Requirement: Build and Quality Scripts

`apps/web/package.json` SHALL expose `dev`, `build`, `typecheck`, and `lint` scripts. `pnpm build` SHALL produce a `.next/` output directory.

#### Scenario: Production build succeeds

- GIVEN `apps/web` source files are valid TypeScript/React
- WHEN `pnpm build --filter @beim/web` runs
- THEN `.next/` directory is created
- AND exit code is 0

### Requirement: Data Route Runtime

All routes that import from `@beim/data` (Prisma client) SHALL set `export const runtime = 'nodejs'` to avoid Edge Runtime incompatibility.

#### Scenario: Route with Prisma runs on Node

- GIVEN a route imports `listProducts` from `@beim/data`
- WHEN the route exports `runtime = 'nodejs'`
- THEN Next.js serves the route on Node.js runtime
- AND no Prisma client errors occur at request time

### Requirement: Tailwind CSS Integration

`apps/web` SHALL configure Tailwind CSS with `tailwind.config.ts` and a global CSS file importing Tailwind directives. Tailwind utility classes SHALL be available in all components.

#### Scenario: Tailwind classes apply

- GIVEN `apps/web` is running in dev mode
- WHEN a component uses `className="text-2xl font-bold"`
- THEN the rendered HTML includes the corresponding CSS rules

### Requirement: Baseline Smoke Test

The app SHALL include at least one test verifying that the home page renders without crashing (component-level or build gate).

#### Scenario: Home page smoke test passes

- GIVEN `apps/web` has a smoke test for the home page component
- WHEN `pnpm test --filter @beim/web` runs
- THEN the test passes with exit code 0
