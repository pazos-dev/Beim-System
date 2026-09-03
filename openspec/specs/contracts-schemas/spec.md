# Contracts Schemas Specification

## Purpose

Zod schemas + inferred TS types for 9 core entities and shared enums, mapped from legacy DB schema and server sources.

## Requirements

### Entity Schemas

| Schema | Table | Key fields | Required |
|--------|-------|------------|----------|
| `userSchema` | `users` | id (UUID), name, firstName, lastName, username, email, passwordHash, role (UserRole), phone, company, ci, rut, department, locality, address, website, tradeReferences, isWholesaler, isBeim, isApproved, createdAt, updatedAt | name, passwordHash, role |
| `productSchema` | `products` | id (text), productCode, name, categoryId, brand, model, price (z.number()), currency (Currency), stock, minStock, warrantyDays, badge, image, description, productType, compatibleModels (string[]), supplierName, supplierLot, color, costPrice (z.number()), createdAt, updatedAt | name, categoryId, price, currency, stock |
| `categorySchema` | `categories` | id (text), name, code, description, parentId (optional), sortOrder, createdAt, updatedAt | name, code, description |
| `orderSchema` | `orders` | id (text), invoiceNumber, userId (UUID opt), customer, email, phone, ci, rut, paymentMethodId, paymentMethodName, paymentInstructions, paymentStatus (PaymentStatus), paymentReceiptPath, paymentReceiptName, paymentReviewedAt, stockCommitted, documentType, documentValue, address, shipping, comments, total (z.number()), currency (Currency), status (OrderStatus), createdAt, updatedAt | customer, total, currency, status, paymentStatus |
| `orderItemSchema` | `order_items` | id (number), orderId, productId, productCode, productName, quantity (int > 0), unitPrice (z.number()), currency (Currency) | orderId, productName, quantity, unitPrice |
| `clientSchema` | `gestion_clients` | id (text), name, document, phone, email, createdAt, updatedAt | name |
| `serviceSchema` | `gestion_services` | id (text), categoryName, name, costPrice (z.number()), salePrice (z.number()), durationText, warrantyText, notes, productKey, productName, brand, model, active (boolean), createdAt, updatedAt | name, categoryName, costPrice, salePrice |
| `serviceCategorySchema` | `gestion_service_categories` | id (text), name, createdAt | name |
| `stockMovementSchema` | `gestion_stock_movements` | id (number), productId, movementType (StockMovementType), quantity (int), balanceAfter (int), referenceType, referenceId, detail, createdAt | productId, movementType, quantity, balanceAfter |

#### Scenario: Valid entity parses

- GIVEN an object with all required fields and correct types
- WHEN `schema.parse(obj)` is called
- THEN it returns a typed object

#### Scenario: Missing required field rejects

- GIVEN an object missing a required field
- WHEN `schema.safeParse(obj)` is called
- THEN `success` is `false` with error on the missing field

#### Scenario: Type mismatch rejects

- GIVEN `price: "not-a-number"` for productSchema
- WHEN `productSchema.safeParse(obj)` is called
- THEN `success` is `false`

#### Scenario: Enum rejection

- GIVEN `role: "invalid"` for userSchema or `status: "Unknown"` for orderSchema
- WHEN `schema.safeParse(obj)` is called
- THEN `success` is `false` with union error

#### Scenario: Optional fields omitted

- GIVEN an object without optional fields (e.g., no `phone`, no `ci`)
- WHEN `schema.parse(obj)` is called
- THEN it parses successfully with optional fields absent

#### Scenario: Money decimals preserved

- GIVEN `price: 1234.56` or `total: 0.01`
- WHEN `schema.parse(obj)` is called
- THEN numeric values are preserved without precision loss

## Shared Enums

| Enum | Values | Source |
|------|--------|--------|
| `UserRole` | `cliente \| admin \| superadmin` | `users.role` CHECK |
| `Currency` | `UYU \| USD \| USDT` | `products`/`orders` CHECK |
| `OrderStatus` | `Pendiente \| Pagado \| Enviado \| Entregado \| Cancelado` | `orders.status` in server.js |
| `PaymentStatus` | `Pendiente de pago \| Pagado \| Parcial \| Rechazado` | `orders.payment_status` |
| `StockMovementType` | `sale \| purchase \| adjustment \| return \| transfer` | `gestion_stock_movements.movement_type` |

#### Scenario: Enum covers legacy values

- GIVEN each enum contains all values from legacy CHECK constraints
- WHEN a legacy value is passed to a schema
- THEN it parses; values outside the enum are rejected

## Type Inference

Each schema SHALL export a `z.infer` type (e.g., `User`, `Product`). Types MUST be importable from `@beim/contracts`.

#### Scenario: Inferred type compiles

- GIVEN `type User = z.infer<typeof userSchema>`
- WHEN a valid object is assigned to `User`
- THEN TypeScript accepts the assignment
