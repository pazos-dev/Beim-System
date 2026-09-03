# Design: Data Persistence Layer (`packages/data`)

## Technical Approach

Translate the 23 legacy SQL tables into a Prisma schema with PostgreSQL, add per-domain mapper functions that convert Prisma rows to `@beim/contracts` Zod types (Decimal→number, text money→number), expose thin data-access functions returning contract types, and provide an idempotent seed script. The package is a pure persistence layer — no domain logic.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| Money representation | `Decimal` in Prisma + convert at mapper boundary vs `Float` vs `String` with app-side parse | Float loses precision; String pushes complexity everywhere; Decimal is Prisma-native for `numeric()` | `Decimal` → `number` in mapper (ADR-001) |
| Mapper function purity | Pure `(row) → contract` functions vs class-based mappers with state | Classes add ceremony; pure functions are trivially testable, composable, and match existing contracts/domain patterns | Pure functions (ADR-002) |
| Data-layer orchestration | Data layer calls domain services vs apps orchestrate domain + data | Data layer calling domain creates circular deps (domain depends on contracts, data depends on contracts+domain); dumb persistence keeps layers clean | Data layer is dumb persistence; apps/orchestrators compose domain + data (ADR-003) |
| Dynamic table handling | Add missing tables to Prisma schema with inferred columns vs keep them in raw SQL | Raw SQL fragments the persistence layer; 4 tables is manageable in schema | Static Prisma models for all 23 tables |

## Data Flow

```
App / Orchestrator
    │
    ├──→ @beim/domain (pure business rules, uses contract types)
    │
    ├──→ @beim/data (persistence layer)
    │       ├── prisma/        (schema + generated client)
    │       ├── mapper/        (Prisma row → contract type)
    │       └── access/        (thin CRUD returning contract types)
    │
    └──→ @beim/contracts (Zod schemas + types — shared boundary)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/data/package.json` | Create | Package config: `@beim/data`, prisma deps, seed script |
| `packages/data/tsconfig.json` | Create | Extends `@beim/tsconfig/node.json` |
| `packages/data/prisma/schema.prisma` | Create | 23 models, 5 enums, all indexes |
| `packages/data/src/index.ts` | Create | Barrel re-exports for mapper, access, prisma client |
| `packages/data/src/mapper/money.ts` | Create | `parseBeimMoney`, `decimalToNumber` helpers |
| `packages/data/src/mapper/user.ts` | Create | `toUserContract(prismaUser) → User` |
| `packages/data/src/mapper/product.ts` | Create | `toProductContract(prismaProduct) → Product` |
| `packages/data/src/mapper/category.ts` | Create | `toCategoryContract(prismaCategory) → Category` |
| `packages/data/src/mapper/order.ts` | Create | `toOrderContract`, `toOrderItemContract` |
| `packages/data/src/mapper/receipt.ts` | Create | `toReceiptContract` (beim_receipts + parts/payments/checklists) |
| `packages/data/src/mapper/client.ts` | Create | `toClientContract(prismaClient) → Client` |
| `packages/data/src/mapper/service.ts` | Create | `toServiceContract`, `toServiceCategoryContract` |
| `packages/data/src/mapper/stock-movement.ts` | Create | `toStockMovementContract` |
| `packages/data/src/access/user.ts` | Create | `listUsers`, `getUserById`, `upsertUser` |
| `packages/data/src/access/product.ts` | Create | `listProducts`, `getProductById`, `upsertProduct` |
| `packages/data/src/access/category.ts` | Create | `listCategories`, `getCategoryById`, `upsertCategory` |
| `packages/data/src/access/order.ts` | Create | `listOrders`, `getOrderById`, `createOrder`, `updateOrder` |
| `packages/data/src/access/receipt.ts` | Create | `getReceiptById`, `searchReceipts`, `createReceipt`, `updateReceipt` |
| `packages/data/src/access/client.ts` | Create | `listClients`, `getClientById`, `upsertClient` |
| `packages/data/src/access/service.ts` | Create | `listServices`, `upsertService`, `upsertServiceCategory`, `deleteServiceCategory`, `deleteService` |
| `packages/data/src/access/stock-movement.ts` | Create | `listStockMovements` |
| `packages/data/src/access/prisma.ts` | Create | Singleton `PrismaClient` instance |
| `packages/data/src/seed.ts` | Create | Idempotent seed script (users, settings, categories, products, slides) |
| `packages/data/.env.example` | Create | `DATABASE_URL=postgresql://...` |
| `pnpm-workspace.yaml` | Modify | Already includes `packages/*` (no change needed) |

## Interfaces / Contracts

### Prisma Enums (matching `@beim/contracts`)

```prisma
enum UserRole { cliente admin superadmin }
enum Currency { UYU USD USDT }
enum OrderStatus { Pendiente Pagado Enviado Entregado Cancelado }
enum PaymentStatus { Pendiente_de_pago Pagado Parcial Rechazado }
enum StockMovementType { sale purchase return adjustment sale_annulment purchase_annulment web_transfer_out web_transfer_in initial_stock service_order_sale service_order_return }
```

### Mapper Signature Pattern

```typescript
// Each mapper is a pure function: PrismaRow → Contract type
import type { Prisma } from '@prisma/client'
import type { User } from '@beim/contracts'

export function toUserContract(row: Prisma.UserGetPayload<true>): User {
  return {
    id: row.id,
    name: row.name,
    firstName: row.first_name ?? undefined,
    // ... snake_case → camelCase, Decimal → number, null → undefined
  }
}
```

### Data-Access Signature Pattern

```typescript
import { prisma } from './prisma'
import { toProductContract } from '../mapper/product'
import type { Product } from '@beim/contracts'

export async function getProductById(id: string): Promise<Product | null> {
  const row = await prisma.product.findUnique({ where: { id } })
  return row ? toProductContract(row) : null
}
```

### Seed Shape

```typescript
// src/seed.ts — invoked by `prisma db seed`
export async function main(): Promise<void> {
  // upsert users (3 rows), app_settings (1 row), categories (7), products (6), promo_slides (3)
  // Uses prisma.$transaction for atomicity; upsert keyed on unique constraints
}
```

## Table-to-Model Mapping

| SQL Table | Prisma Model | ID Type | Notes |
|-----------|-------------|---------|-------|
| `app_settings` | `AppSetting` | `String` (PK: key) | Singleton-style rows |
| `users` | `User` | `UUID` | Enum: `UserRole` |
| `categories` | `Category` | `String` | Self-referential `parentId` |
| `products` | `Product` | `String` | `price` as `Decimal(12,2)` |
| `promo_slides` | `PromoSlide` | `String` | Numeric positioning fields |
| `orders` | `Order` | `String` | Enums: `OrderStatus`, `PaymentStatus`, `Currency` |
| `beim_receipts` | `BeimReceipt` | `UUID` | `price` stays `String`; `payload` as `Json` |
| `order_items` | `OrderItem` | `BigInt` | `bigserial` PK |
| `beim_receipt_parts` | `BeimReceiptPart` | `UUID` | |
| `beim_receipt_payments` | `BeimReceiptPayment` | `UUID` | |
| `beim_receipt_checklists` | `BeimReceiptChecklist` | `UUID` | `checks` as `Json` |
| `audit_logs` | `AuditLog` | `BigInt` | `details` as `Json` |
| `beim_fixed_expenses` | `BeimFixedExpense` | `UUID` | |
| `gestion_cash_sessions` | `GestionCashSession` | `UUID` | |
| `gestion_financial_state` | `GestionFinancialState` | `Int` (singleton) | Multiple `Json` columns |
| `gestion_payment_movements` | `GestionPaymentMovement` | `BigInt` | |
| `gestion_users` | `GestionUser` | `UUID` | |
| `gestion_role_permissions` | `GestionRolePermission` | `String` (PK: role) | `permissions` as `Json` |
| `gestion_web_access_tokens` | `GestionWebAccessToken` | `String` (PK: token_hash) | |
| `gestion_stock_movements` | `GestionStockMovement` | `BigInt` | Inferred from server.js |
| `gestion_clients` | `GestionClient` | `UUID` | Inferred from server.js |
| `gestion_services` | `GestionService` | `UUID` | Inferred from server.js |
| `gestion_service_categories` | `GestionServiceCategory` | `UUID` | Inferred from server.js |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (mapper) | Each `toContract` function with hand-crafted Prisma-shaped objects | Vitest; mock `Decimal` via `{ toNumber: () => n }`; no DB needed |
| Unit (money) | `parseBeimMoney` with standard, comma-decimal, garbage, empty inputs | Vitest; pure function tests |
| Unit (access) | Verify access functions call correct Prisma methods | Vitest; mock Prisma client |
| Integration | Seed script, mapper→schema round-trip | Deferred to app phase (needs DB) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. This is a greenfield package. Legacy `schema.sql` remains untouched for the legacy apps during coexistence.

## Open Questions

- [ ] `gestion_services` columns: inferred from server.js (`name`, `sale_price`, `cost_price`, `category_name`, `active`, etc.) — confirm exact schema with full table DDL when available
- [ ] `gestion_clients` columns: inferred from `upsertGestionClientFromReceipt` calls — confirm `name`, `document`, `phone`, `email` match `clientSchema`
- [ ] Sequence strategy for `product_code` and `invoice_number`: Prisma supports `@default(autoincrement())` but sequences need explicit init — may need raw SQL in seed or migration
