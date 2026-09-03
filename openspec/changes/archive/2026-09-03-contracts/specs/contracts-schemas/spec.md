# Delta for contracts-schemas

## ADDED Requirements

### Entity Schemas

| Schema | Legacy table | Key fields | Notes |
|--------|-------------|------------|-------|
| `userSchema` | `users` | id (UUID), name, firstName, lastName, username, email, passwordHash, role (UserRole), phone, company, ci, rut, department, locality, address, website, tradeReferences, isWholesaler, isBeim, isApproved, createdAt, updatedAt | Required: name, passwordHash, role |
| `productSchema` | `products` + ALTERs | id (text), productCode, name, categoryId, brand, model, price (z.number()), currency (Currency), stock, minStock, warrantyDays, badge, image, description, productType, compatibleModels (string[]), supplierName, supplierLot, color, costPrice (z.number()), createdAt, updatedAt | Required: name, categoryId, price, currency, stock |
| `categorySchema` | `categories` | id (text), name, code, description, parentId (optional), sortOrder, createdAt, updatedAt | Required: name, code, description |
| `orderSchema` | `orders` | id (text), invoiceNumber, userId (UUID optional), customer, email, phone, ci, rut, paymentMethodId, paymentMethodName, paymentInstructions, paymentStatus (PaymentStatus), paymentReceiptPath, paymentReceiptName, paymentReviewedAt, stockCommitted, documentType, documentValue, address, shipping, comments, total (z.number()), currency (Currency), status (OrderStatus), createdAt, updatedAt | Required: customer, total, currency, status, paymentStatus |
| `orderItemSchema` | `order_items` | id (number), orderId, productId, productCode, productName, quantity (int > 0), unitPrice (z.number()), currency (Currency) | Required: orderId, productName, quantity, unitPrice |
| `clientSchema` | `gestion_clients` | id (text), name, document, phone, email, createdAt, updatedAt | Required: name |
| `serviceSchema` | `gestion_services` | id (text), categoryName, name, costPrice (z.number()), salePrice (z.number()), durationText, warrantyText, notes, productKey, productName, brand, model, active (boolean), createdAt, updatedAt | Required: name, categoryName, costPrice, salePrice |
| `serviceCategorySchema` | `gestion_service_categories` | id (text), name, createdAt | Required: name |
| `stockMovementSchema` | `gestion_stock_movements` | id (number), productId, movementType (StockMovementType), quantity (int), balanceAfter (int), referenceType, referenceId, detail, createdAt | Required: productId, movementType, quantity, balanceAfter |

### Scenario: Valid entity parses

- GIVEN an object matching a schema's required fields with correct types
- WHEN `schema.parse(obj)` is called
- THEN it returns a typed object; `safeParse` returns `{ success: true }`

### Scenario: Missing required field rejects

- GIVEN an object missing any required field for a schema
- WHEN `schema.safeParse(obj)` is called
- THEN `success` is `false` with an error referencing the missing field

### Scenario: Type mismatch rejects

- GIVEN an object with `price: "not-a-number"` for productSchema
- WHEN `productSchema.safeParse(obj)` is called
- THEN `success` is `false` with a type error on `price`

### Scenario: Enum value validation

- GIVEN an object with `role: "invalid"` for userSchema or `status: "Unknown"` for orderSchema
- WHEN `schema.safeParse(obj)` is called
- THEN `success` is `false` with a union/enum error

### Scenario: Optional fields default correctly

- GIVEN an object omitting optional fields (e.g., user without `phone`, order without `ci`)
- WHEN `schema.parse(obj)` is called
- THEN optional fields are accepted as `undefined` and required fields are present

### Scenario: Money fields accept decimals

- GIVEN a product with `price: 1234.56` or an order with `total: 0.01`
- WHEN `productSchema.parse(obj)` or `orderSchema.parse(obj)` is called
- THEN numeric values are preserved without precision loss

## Shared Enums

| Enum | Values | Source |
|------|--------|--------|
| `UserRole` | `cliente \| admin \| superadmin` | `users.role` CHECK |
| `Currency` | `UYU \| USD \| USDT` | `products.currency`, `orders.currency` CHECK |
| `OrderStatus` | `Pendiente \| Pagado \| Enviado \| Entregado \| Cancelado` | `orders.status` usage in server.js |
| `PaymentStatus` | `Pendiente de pago \| Pagado \| Parcial \| Rechazado` | `orders.payment_status` usage |
| `StockMovementType` | `sale \| purchase \| return \| adjustment \| sale_annulment \| purchase_annulment \| web_transfer_out \| web_transfer_in \| initial_stock \| service_order_sale \| service_order_return` | `gestion_stock_movements.movement_type` usage |

### Scenario: Enum covers legacy CHECK values

- GIVEN each enum contains exactly the values present in legacy CHECK constraints or code usage
- WHEN a legacy value is passed to a schema
- THEN it parses successfully; any value outside the enum is rejected

## Type Export

Each schema SHALL export an inferred type via `z.infer<typeof schema>` (e.g., `User`, `Product`, `Order`). Types MUST be importable from `@beim/contracts`.

### Scenario: Inferred type matches schema shape

- GIVEN `type User = z.infer<typeof userSchema>`
- WHEN a `User` variable is assigned a valid object
- THEN TypeScript accepts the assignment without errors
