# data-access Specification

## Purpose

Thin data-access functions that apps call to query and persist data. Each function uses the Prisma client, maps results through the mapper layer, and returns `@beim/contracts` types.

## Requirements

### Requirement: Function-per-Operation Pattern

Each data-access function SHALL perform a single query or mutation and return a mapped contract type. Functions are organized in per-domain files matching the mapper structure.

#### Scenario: getUserById returns User contract

- GIVEN a user exists with `id = "abc"`
- WHEN `getUserById("abc")` is called
- THEN the result satisfies `userSchema.parse(result)`

### Requirement: Query Functions for Reads

Read functions SHALL accept filter/pagination parameters and return arrays or single items. Key functions: `listUsers`, `getUserById`, `getProductById`, `listProducts`, `getCategoryById`, `listCategories`, `getOrderById`, `listOrders`, `getReceiptById`, `searchReceipts`, `listClients`, `getClientById`, `listServices`, `listServiceCategories`, `listStockMovements`.

#### Scenario: List with filter

- GIVEN 5 products exist, 2 in category `"celulares"`
- WHEN `listProducts({ categoryId: "celulares" })` is called
- THEN exactly 2 Product contracts are returned

### Requirement: Mutation Functions for Writes

Write functions SHALL accept contract-shaped input and return the persisted result. Key functions: `upsertUser`, `upsertProduct`, `upsertCategory`, `createOrder`, `updateOrder`, `createReceipt`, `updateReceipt`, `upsertClient`, `upsertService`, `upsertServiceCategory`, `deleteServiceCategory`, `deleteService`, `deleteClient`.

#### Scenario: Create receipt

- GIVEN a valid receipt input object
- WHEN `createReceipt(input)` is called
- THEN a new receipt is persisted and a mapped contract is returned

### Requirement: Decimal-to-Number at Boundary

All data-access read functions SHALL ensure that `Decimal` fields from Prisma are converted to `number` before returning contract types. The mapper layer handles this.

#### Scenario: Read price as number

- GIVEN a product with `price = Decimal("35600.00")`
- WHEN `getProductById(id)` is called
- THEN `result.price` is `35600` (type `number`)

### Requirement: No Domain Logic in Data Access

Data-access functions SHALL NOT contain business rules, validation, or orchestration. They are pure persistence proxies.

#### Scenario: Business logic stays in domain

- GIVEN a function `createOrder`
- WHEN implemented
- THEN it performs only DB insert + mapping, with no status validation or stock checks

### Requirement: Client Upsert by Name/Document

`upsertClient` SHALL find existing clients by matching `document` or `name` (case-insensitive) and update if found, or create if not. This replicates the legacy `upsertGestionClientFromReceipt` behavior.

#### Scenario: Existing client updated

- GIVEN a client with `document = "12345678"` exists
- WHEN `upsertClient({ document: "12345678", name: "Ana Perez", phone: "112233" })` is called
- THEN the existing client's `phone` is updated to `"112233"`

#### Scenario: New client created

- GIVEN no client with `document = "99999999"` exists
- WHEN `upsertClient({ document: "99999999", name: "New Client" })` is called
- THEN a new client is created with the given data

### Requirement: Receipt Search by Client Name/ID

`searchReceipts(term)` SHALL search across `client_name`, `client_id`, `device_model`, and `imei_serial` fields (case-insensitive LIKE), matching the legacy `searchBeimReceipts` behavior.

#### Scenario: Search by client name

- GIVEN receipts exist with `clientName = "Ana Perez"`
- WHEN `searchReceipts("ana")` is called
- THEN matching receipts are returned
