# data-mapper Specification

## Purpose

Map Prisma row types to `@beim/contracts` Zod types. No domain logic — pure type conversion at the persistence boundary.

## Requirements

### Requirement: One Mapper Per Domain Area

Mapper functions SHALL be organized per domain: `user`, `product`, `category`, `order`, `receipt`, `client`, `service`, `stock-movement`. Each file exports a `toContract` function (or equivalent) that accepts a Prisma row and returns a `@beim/contracts` type.

#### Scenario: User row maps to User contract

- GIVEN a Prisma `User` row with all fields populated
- WHEN `toContract(row)` is called
- THEN the result satisfies `userSchema.parse(result)`

### Requirement: Decimal to Number Conversion

All Prisma `Decimal` fields SHALL be converted to `number` in mapper output. The mapper MUST handle `Decimal` values by calling `.toNumber()` or equivalent.

#### Scenario: Product price conversion

- GIVEN a product row with `price: Prisma.Decimal("35600.00")`
- WHEN mapped to contract
- THEN `result.price` is `35600` (type `number`, not `Decimal`)

### Requirement: parseBeimMoney Utility

A `parseBeimMoney(value: string): number` function SHALL replicate the SQL `parse_beim_money` regex: strip non-digits except `,.-`, replace `,` with `.`, parse as number, coalesce to `0`.

#### Scenario: Standard format

- GIVEN `parseBeimMoney("35.600")`
- WHEN called
- THEN returns `35600`

#### Scenario: Comma decimal

- GIVEN `parseBeimMoney("1.234,56")`
- WHEN called
- THEN returns `1234.56`

#### Scenario: Garbage characters

- GIVEN `parseBeimMoney("$ 35.600 UYU")`
- WHEN called
- THEN returns `35600`

#### Scenario: Empty/null input

- GIVEN `parseBeimMoney("")` or `parseBeimMoney(null)`
- WHEN called
- THEN returns `0`

### Requirement: Role Enum Mapping

User `role` strings from the database SHALL map to the `UserRole` enum values. No transformation needed — values are identical between DB and contracts.

#### Scenario: Role passthrough

- GIVEN a user with `role: "admin"`
- WHEN mapped
- THEN `result.role` equals `"admin"` and passes `UserRole.parse()`

### Requirement: Json Field Passthrough

`Json` fields (e.g., `beim_receipts.payload`) SHALL be passed through as-is to the contract type. No deep mapping — the contract types declare `JsonValue` or equivalent.

#### Scenario: Payload preserved

- GIVEN `beim_receipts.payload` is `{ saleId: "s1", items: [] }`
- WHEN mapped to receipt contract
- THEN `result.payload` is the same JSON structure

### Requirement: Null Handling for Optional Relations

Optional foreign key columns (`null` in DB) SHALL map to `undefined` (or omitted field) in the contract, not `null`.

#### Scenario: Null FK becomes undefined

- GIVEN a receipt with `userId: null`
- WHEN mapped
- THEN `result.userId` is `undefined` (or the field is omitted), satisfying the Zod schema

### Requirement: Array Field Mapping

`text[]` columns (e.g., `products.compatible_models`, `beim_receipts.services`) SHALL be mapped to `string[]` in the contract.

#### Scenario: Array preserved

- GIVEN `compatible_models` is `["iPhone 15", "iPhone 16"]`
- WHEN mapped
- THEN `result.compatibleModels` is `["iPhone 15", "iPhone 16"]`
