# Webshop API Specification

## Purpose

Storefront resources (`/api/v1/...`): catalog, orders, Stripe checkout, promo-slides, uploads. Read-optimized; stock shared with gestion via `products`/`beim_receipts`.

## Requirements

### Requirement: Catalog, Orders, and Checkout

The system MUST expose paginated catalog reads and MUST create orders transactionally (order + items). Checkout MUST mint a Stripe session and MUST NOT mark payment without webhook confirmation.

#### Scenario: Paginated catalog

- GIVEN 50 published products
- WHEN GET `/api/v1/products?page=2&limit=20`
- THEN 20 items returned AND pagination metadata present

#### Scenario: Order then pay

- GIVEN a cart with in-stock products
- WHEN POST `/api/v1/orders` then POST `/api/v1/checkout-sessions`
- THEN order created as unpaid AND checkout session URL returned AND payment stays unpaid until webhook

### Requirement: Promo Slides and Uploads

The system MUST serve only published promo-slides in order and MUST validate uploads (type, size) server-side, storing a stable URL.

#### Scenario: Slides ordered

- GIVEN three slides with two published
- WHEN GET `/api/v1/promo-slides`
- THEN only published slides returned in defined order

#### Scenario: Invalid upload rejected

- GIVEN an authenticated editor
- WHEN POST `/api/v1/uploads/product-image` with an executable file
- THEN status 415 AND no file stored
