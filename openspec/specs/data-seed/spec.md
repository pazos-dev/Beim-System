# data-seed Specification

## Purpose

Prisma seed script that reproduces the data from `pagina-web/db/seed.sql` — users, app_settings, categories, products, and promo_slides.

## Requirements

### Requirement: Seed Script Entry Point

A `src/seed.ts` file SHALL export an `async function main()` that the Prisma seed runner invokes.

#### Scenario: Seed runs via prisma db seed

- GIVEN `package.json` configures `prisma.seed` to run `tsx src/seed.ts`
- WHEN `prisma db seed` is executed
- THEN the seed function executes without error

### Requirement: Idempotent Execution

The seed SHALL use `upsert` (or equivalent conflict handling) so that running it multiple times does not create duplicate records or fail on unique constraint violations.

#### Scenario: Second run succeeds

- GIVEN the database already contains seed data
- WHEN the seed runs again
- THEN no errors occur and existing records are updated to match seed values

### Requirement: User Seed Data

The seed SHALL insert 3 users: an `admin` user, a `superadmin` user, and a `cliente` user, matching the 3 rows in `seed.sql`.

#### Scenario: Users created

- GIVEN a fresh database
- WHEN seed runs
- THEN 3 users exist with roles `admin`, `superadmin`, and `cliente`

### Requirement: App Settings Seed

The seed SHALL insert the `store` key in `app_settings` with the full JSON payload from `seed.sql` (whatsapp, instagram, heroText, productBrands, paymentMethods).

#### Scenario: Store settings populated

- GIVEN seed has run
- WHEN `app_settings` is queried for key `store`
- THEN the JSON value contains `whatsapp`, `paymentMethods` array, and `productBrands` array

### Requirement: Category Seed Data

The seed SHALL insert 7 categories: `celulares`, `notebooks`, `audio`, `smartwatch`, `gaming`, `accesorios`, `servicio`.

#### Scenario: Seven categories exist

- GIVEN seed has run
- WHEN categories are queried
- THEN 7 rows exist with the expected IDs and names

### Requirement: Product Seed Data

The seed SHALL insert 6 products: `smartphone-premium`, `notebook-ultraliviana`, `auriculares-wireless`, `reloj-inteligente`, `cargador-rapido`, `combo-gaming`, each linked to the correct category.

#### Scenario: Products linked to categories

- GIVEN seed has run
- WHEN the product `smartphone-premium` is queried
- THEN `categoryId` is `"celulares"` and `price` is `35600`

### Requirement: Promo Slide Seed Data

The seed SHALL insert 3 promo slides: `slide-1`, `slide-2`, `slide-3` with their labels, hrefs, and image positioning values.

#### Scenario: Slides created

- GIVEN seed has run
- WHEN promo slides are queried
- THEN 3 slides exist with `sortOrder` 1, 2, 3 respectively

### Requirement: Seed Does Not Touch Non-Seed Tables

The seed SHALL NOT insert data into tables not present in `seed.sql` (e.g., `orders`, `beim_receipts`, `gestion_*`).

#### Scenario: Only seed tables populated

- GIVEN seed has run on a fresh database
- WHEN `orders`, `beim_receipts`, `gestion_clients` are queried
- THEN zero rows exist in those tables
