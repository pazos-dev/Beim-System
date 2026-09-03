# data-schema Specification

## Purpose

Prisma schema covering all 23 legacy tables with correct relations, enums, indexes, and unique constraints. Maps legacy SQL types to Prisma/PostgreSQL types faithfully.

## Requirements

### Requirement: All 23 Tables Modeled

The schema SHALL contain exactly 23 Prisma models, one per legacy table: `app_settings`, `users`, `categories`, `products`, `promo_slides`, `orders`, `beim_receipts`, `order_items`, `beim_receipt_parts`, `beim_receipt_payments`, `beim_receipt_checklists`, `audit_logs`, `beim_fixed_expenses`, `gestion_cash_sessions`, `gestion_financial_state`, `gestion_payment_movements`, `gestion_users`, `gestion_role_permissions`, `gestion_web_access_tokens`, `gestion_stock_movements`, `gestion_clients`, `gestion_service_categories`, `gestion_services`.

#### Scenario: Model count matches legacy

- GIVEN `schema.prisma` is written
- WHEN `prisma format` + `prisma generate` run successfully
- THEN exactly 23 models exist in the schema

### Requirement: Enum Types for CHECK Columns

The schema SHALL define Prisma `enum` types for columns that use SQL `CHECK` constraints: `UserRole` (`cliente | admin | superadmin`), `Currency` (`UYU | USD | USDT`), `OrderStatus` (`Pendiente | Pagado | Enviado | Entregado | Cancelado`), `PaymentStatus` (`Pendiente de pago | Pagado | Parcial | Rechazado`), `StockMovementType` (11 values from contracts).

#### Scenario: Enums match contracts

- GIVEN the schema enums are defined
- WHEN compared to `@beim/contracts` enums
- THEN every enum value in contracts exists in the corresponding Prisma enum

### Requirement: Money Columns Use Decimal

Columns with `numeric(12,2)` or `numeric(14,2)` in SQL SHALL be modeled as `Decimal` in Prisma (`@db.Decimal(12,2)` or `@db.Decimal(14,2)`). Applies to: `products.price`, `orders.total`, `beim_receipts.quote_total`, `beim_receipt_parts.unit_cost`, `beim_receipt_parts.unit_price`, `beim_receipt_payments.amount`, `beim_fixed_expenses.amount`, `gestion_cash_sessions.*_amount`, `gestion_financial_state.capital_initial`, `gestion_payment_movements.amount`, `gestion_services.cost_price`, `gestion_services.sale_price`.

#### Scenario: Decimal precision preserved

- GIVEN a product price of `35600.00`
- WHEN persisted and read back through Prisma
- THEN the value is `Decimal` with scale 2, convertible to `number` without precision loss

### Requirement: Text Money Column Preserved

`beim_receipts.price` SHALL remain `String` in the Prisma schema (not converted to numeric), matching the legacy `text` column. The `parseBeimMoney` mapper handles conversion.

#### Scenario: Price stays text

- GIVEN `beim_receipts.price` is `"35600"`
- WHEN read via Prisma
- THEN the field type is `string`

### Requirement: Json Columns

Columns with `jsonb` in SQL SHALL be `Json` in Prisma: `app_settings.value`, `audit_logs.details`, `beim_receipts.payload`, `beim_receipt_checklists.checks`, `gestion_financial_state.expenses/menu_items/accounting_state/preferences`, `gestion_role_permissions.permissions`.

#### Scenario: Json round-trip

- GIVEN a `payload` column stores `{"key":"value"}`
- WHEN read via Prisma
- THEN the value is `Prisma.JsonValue`

### Requirement: Relations

Foreign keys SHALL be modeled as Prisma `@relation` directives. Key relations: `orders.user_id → users`, `products.category_id → categories`, `categories.parent_id → categories` (self), `order_items.order_id → orders`, `beim_receipts.user_id → users`, `beim_receipt_parts.receipt_id → beim_receipts`, `beim_receipt_payments.receipt_id → beim_receipts`, `gestion_stock_movements.product_id → products`, `gestion_payment_movements.receipt_id → beim_receipts`.

#### Scenario: Cascade rules match legacy

- GIVEN an order is deleted
- WHEN cascade propagates
- THEN `order_items` are deleted (cascade) and `users` are set null (set null), matching legacy SQL

### Requirement: Indexes Replicated

All legacy indexes SHALL be present as `@@index` directives on the corresponding models.

#### Scenario: Index count matches legacy

- GIVEN the 30+ legacy `CREATE INDEX` statements
- WHEN `schema.prisma` is inspected
- THEN every legacy index has a corresponding `@@index` on the correct model and columns

### Requirement: Unique Constraints

Primary keys, `unique` constraints, and sequence-backed columns SHALL be modeled: `users.username` unique, `users.email` unique, `products.product_code` unique, `orders.invoice_number` unique, `beim_receipts.receipt_number` unique, `gestion_users.username` unique, `gestion_service_categories.name` unique, `gestion_cash_sessions.business_date` unique.

#### Scenario: Uniqueness enforced

- GIVEN two users with the same `email`
- WHEN both are inserted
- THEN the second insert fails with a unique constraint violation
