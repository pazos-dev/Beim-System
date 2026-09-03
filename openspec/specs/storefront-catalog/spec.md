# storefront-catalog Specification

## Purpose

Read-only catalog browsing — home listing, category filtering, and product detail. All data flows through `@beim/data` access functions in Server Components. No persistence writes in this slice.

## Requirements

### Requirement: Home Catalog Listing

Home page (`/`) SHALL display all products from `listProducts()` (no category filter). Each product card SHALL show: name, price, currency, image (or placeholder), and brand.

#### Scenario: Products render from database

- GIVEN the PostgreSQL database has seeded products
- WHEN a user navigates to `/`
- THEN all products are displayed in a grid
- AND each product card shows name, price with currency, and image

#### Scenario: Empty catalog

- GIVEN the database has zero products
- WHEN a user navigates to `/`
- THEN the page renders without errors
- AND an empty-state message or placeholder is shown

### Requirement: Category Navigation

Categories from `listCategories()` SHALL render in the app shell navigation. Each category links to `/categoria/{id}`.

#### Scenario: Categories appear in nav

- GIVEN the database has seeded categories
- WHEN the home page loads
- THEN category links are visible in the navigation bar
- AND each link has an href pointing to `/categoria/{categoryId}`

### Requirement: Category Filter Page

Route `/categoria/[id]` SHALL render products filtered by `listProducts(categoryId)`. The page SHALL display the category name and only products belonging to that category.

#### Scenario: Filtered products render

- GIVEN category "Celulares" has id `cat-1` and 3 products
- WHEN a user navigates to `/categoria/cat-1`
- THEN only those 3 products are displayed
- AND the page heading includes "Celulares"

#### Scenario: Category with no products

- GIVEN category "Accesorios" has id `cat-2` and zero products
- WHEN a user navigates to `/categoria/cat-2`
- THEN the page renders without errors
- AND an empty-state message is shown

### Requirement: Product Detail Page

Route `/producto/[id]` SHALL render a single product from `getProductById(id)`. The page SHALL display: name, brand, model, price, currency, stock status, description (if present), and warranty info.

#### Scenario: Product renders

- GIVEN product with id `prod-1` exists in the database
- WHEN a user navigates to `/producto/prod-1`
- THEN the page shows the product's name, price, currency, and image
- AND brand and model are displayed if present
- AND stock count is shown

#### Scenario: Product not found

- GIVEN no product has id `nonexistent`
- WHEN a user navigates to `/producto/nonexistent`
- THEN the page returns HTTP 404

### Requirement: Data Access Layer Usage

All catalog data SHALL be fetched through `@beim/data` access functions: `listProducts`, `getProductById`, `listCategories`. Routes SHALL NOT import Prisma client directly.

#### Scenario: Server Component fetches via @beim/data

- GIVEN a Server Component needs product data
- WHEN it imports `listProducts` from `@beim/data`
- THEN the returned data conforms to `@beim/contracts` `Product` type
- AND no direct Prisma imports exist in the component file

### Requirement: Typed Data Contracts

All displayed catalog data SHALL be typed using `@beim/contracts` types (`Product`, `Category`). Components SHALL NOT use `any` or untyped data.

#### Scenario: Type-safe rendering

- GIVEN a product is fetched from `@beim/data`
- WHEN the component renders `product.price`
- THEN TypeScript compiles without errors under ultra-strict config

### Requirement: Catalog Styling

Product grid and catalog pages SHALL use Tailwind CSS. Visual style SHOULD be faithful to legacy `store-pro.css`: teal accent (`#0c9f92`), navy category bar (`#17374b`), Inter + Manrope fonts, responsive grid (1-col mobile, 2-col tablet, 3-4 col desktop).

#### Scenario: Responsive grid layout

- GIVEN the home page renders the product grid
- WHEN viewed on a 375px-wide viewport
- THEN products display in a single column
- AND when viewed at 1200px, products display in 3-4 columns

### Requirement: Read-Only Storefront

No routes in this slice SHALL write to the database. All catalog routes are GET-only Server Components or GET route handlers.

#### Scenario: No write operations exposed

- GIVEN a user browses `/`, `/categoria/[id]`, `/producto/[id]`
- WHEN inspecting the source of these routes
- THEN no `upsertProduct`, `upsertCategory`, `createOrder`, or Prisma `create`/`update`/`delete` calls exist
