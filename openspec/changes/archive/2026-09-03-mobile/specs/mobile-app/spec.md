# mobile-app Specification

## Purpose

Greenfield Expo (managed, SDK ~54) React Native host in `apps/mobile` (`@beim/mobile`). Delivers a view-only storefront catalog slice (home, category, product detail) mirroring `storefront-catalog`, backed by a data adapter that returns `@beim/contracts` types. No live backend or database required — UI consumes a mock adapter in tests. Data flows through the adapter only; `@beim/data` (Prisma) stays server-side.

## Requirements

### Requirement: App Package Structure

`apps/mobile` SHALL be a workspace package named `@beim/mobile`, wired into pnpm and Turborepo, with Metro config, `tsconfig.json` extending `@beim/tsconfig/react.json`, and `@beim/contracts` as a workspace dependency.

#### Scenario: Package resolves in workspace

- GIVEN `apps/mobile/package.json` exists with `"name": "@beim/mobile"`
- WHEN `pnpm install` runs from the root
- THEN `@beim/mobile` resolves without errors

#### Scenario: Metro resolves the contracts workspace package

- GIVEN `@beim/contracts` is a workspace dependency
- WHEN Metro bundles the app
- THEN `@beim/contracts` resolves without resolution errors

#### Scenario: Native deps allowed to build

- GIVEN the `pnpm-workspace.yaml` `allowBuilds` lists native Expo dependencies
- WHEN `pnpm install` runs
- THEN native deps build without a blocked-build error

### Requirement: Navigation Shell

The app SHALL provide a navigation shell with home, category, and product-detail screens (expo-router or react-navigation as proposed), all read-only.

#### Scenario: Screens reachable from shell

- GIVEN the app launches
- WHEN the user navigates
- THEN home, category, and product-detail screens are reachable without errors

### Requirement: View-Only Catalog

The home screen SHALL list all products via the adapter; category navigation SHALL list categories; the category screen SHALL filter products by `categoryId`; the product screen SHALL show a single product by `id`. All data SHALL use `@beim/contracts` types.

#### Scenario: Home renders products

- GIVEN the mock adapter returns seeded products
- WHEN the home screen mounts
- THEN each product card shows name, price with currency, and image or placeholder

#### Scenario: Empty catalog

- GIVEN the adapter returns zero products
- WHEN the home screen mounts
- THEN an empty-state message is shown without an error

#### Scenario: Category filters products

- GIVEN category "Celulares" has id `cat-1` and 3 products
- WHEN the user opens the category screen for `cat-1`
- THEN only those 3 products are displayed and the heading shows "Celulares"

#### Scenario: Product renders detail

- GIVEN product with id `prod-1` exists in the adapter
- WHEN the user opens the product screen for `prod-1`
- THEN name, price, currency, image, brand, model, and stock are shown

### Requirement: Data Adapter

The mobile app SHALL access catalog data only through a `data-adapter` interface exposing `listProducts`, `listCategories`, and `getProductById`, returning `@beim/contracts` types. A `MockCatalogDataSource` SHALL back the MVP; an `HttpCatalogDataSource` stub SHALL be typed against a future mobile API. Renderer code MUST NOT import `@beim/data` or `@prisma/client`.

#### Scenario: Mock adapter returns typed data

- GIVEN the mock data source is selected
- WHEN a screen calls `listProducts()`
- THEN the result satisfies `@beim/contracts` `Product` type

#### Scenario: HTTP adapter stub is typed

- GIVEN `HttpCatalogDataSource` exists
- WHEN it is instantiated
- THEN its method signatures return `@beim/contracts` types and are not `any`

#### Scenario: Prisma import is banned

- GIVEN mobile source files
- WHEN `pnpm lint --filter @beim/mobile` runs
- THEN no source file imports `@beim/data` or `@prisma/client` (eslint import-ban, per desktop-app precedent)

### Requirement: Contracts Validation is RN-Safe

The app SHALL use `@beim/contracts` types and validation that are React Native-safe (no Node builtins, pure TS + zod).

#### Scenario: Contracts bundle on device

- GIVEN `@beim/contracts` is bundled by Metro
- WHEN the app bundles for a device
- THEN no Node builtins are loaded and the bundle succeeds

### Requirement: Build Without Backend

All turbo `mobile#build`, `mobile#typecheck`, `mobile#lint`, and `mobile#test` commands SHALL pass with no live backend or database; tests SHALL use the mock adapter.

#### Scenario: Typecheck and lint pass offline

- GIVEN no live backend or Postgres
- WHEN `pnpm typecheck --filter @beim/mobile` and `pnpm lint --filter @beim/mobile` run
- THEN both exit 0

#### Scenario: Tests pass with mock adapter

- GIVEN the mock data source provides data
- WHEN `pnpm test --filter @beim/mobile` runs
- THEN baseline unit and smoke tests pass without a network or database
