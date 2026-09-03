# Delta for Domain Order

## ADDED Requirements

### Requirement: Service Items Normalization

The system SHALL normalize raw service items by filtering, mapping, and coercing fields.

#### Scenario: Filters source initial items

- GIVEN items `[{source:"initial", price:100}, {source:"added", price:200}]`
- WHEN `normalizeServiceItems` is called
- THEN only the `source:"added"` item remains
- AND `price` is `200`

#### Scenario: Maps approval statuses case-insensitively

- GIVEN item with `approvalStatus: "aprobada"`
- WHEN normalized
- THEN `approvalStatus` is `"Aprobado"`

#### Scenario: Coerces numeric fields

- GIVEN item with `price: "500"` and `quantity: "2"`
- WHEN normalized
- THEN `price` is `500` and `quantity` is `2`

### Requirement: Service Items Total

The system SHALL compute total as the sum of all normalized service item prices.

#### Scenario: Sums prices

- GIVEN items with prices `[100, 200, 50]`
- WHEN total is computed
- THEN result is `350`

#### Scenario: Empty items

- GIVEN no items
- WHEN total is computed
- THEN result is `0`

### Requirement: Technical Base Budget

The system SHALL compute base budget as `max(budget - addedTotal, 0)` where `addedTotal` = `serviceItemsTotal(normalizeServiceItems(order))`.

#### Scenario: Subtracts added items

- GIVEN `budget: 50000`, added items total `20000`
- WHEN base budget computed
- THEN result is `30000`

#### Scenario: Floor at zero

- GIVEN `budget: 10000`, added items total `15000`
- WHEN base budget computed
- THEN result is `0`

### Requirement: Order Status Validation

The system SHALL accept only `Pendiente | Pagado | Enviado | Entregado | Cancelado`.

#### Scenario: Valid status

- GIVEN status `"Pagado"`
- WHEN validated
- THEN no error thrown

#### Scenario: Invalid status

- GIVEN status `"Desconocido"`
- WHEN validated
- THEN `DomainError` thrown

### Requirement: Finished Status Detection

The system SHALL recognize `Finalizado | Entregado | Cancelado` as finished statuses.

#### Scenario: Finished detected

- GIVEN status `"Entregado"`
- WHEN checked
- THEN returns `true`

#### Scenario: Not finished

- GIVEN status `"Pendiente"`
- WHEN checked
- THEN returns `false`

### Requirement: Finished Timestamp

The system SHALL set `finishedAt` on entering a finished status and clear it on leaving.

#### Scenario: Sets timestamp

- GIVEN order with `finishedAt: ""`, status `"Presupuestado"`
- WHEN status becomes `"Entregado"`
- THEN `finishedAt` is a valid ISO timestamp

#### Scenario: Clears timestamp

- GIVEN order with `finishedAt: "2026-01-01T10:00:00Z"`, status `"Entregado"`
- WHEN status becomes `"Presupuestado"`
- THEN `finishedAt` is `""`

### Requirement: Repair Status Derivation

The system SHALL derive: empty→`Presupuestado`, has `Pendiente`→`Esperando aprobacion`, has `Aprobado`→`Aprobado`, else→`Presupuestado`.

#### Scenario: Pending derives waiting

- GIVEN items `["Pendiente", "Aprobado"]`
- WHEN derived
- THEN `"Esperando aprobacion"`

#### Scenario: All approved

- GIVEN items `["Aprobado"]`
- WHEN derived
- THEN `"Aprobado"`

#### Scenario: Empty defaults

- GIVEN no items
- WHEN derived
- THEN `"Presupuestado"`

### Requirement: Approval Status Normalization

The system SHALL map: `aprobado|aprobada`→`Aprobado`, `no aprobado|rechazado|rechazada`→`No aprobado`, default→`Pendiente`.

#### Scenario: Case insensitive

- GIVEN `"APROBADO"`
- WHEN normalized
- THEN `"Aprobado"`

#### Scenario: Rejection

- GIVEN `"rechazada"`
- WHEN normalized
- THEN `"No aprobado"`

### Requirement: Duplicate Service Item Detection

The system SHALL detect duplicate service item descriptions by normalized label.

#### Scenario: Detects duplicates

- GIVEN items `["Cambio SSD", "Limpieza", "Cambio SSD"]`
- WHEN duplicates checked
- THEN `["Cambio SSD"]` is returned

#### Scenario: No duplicates

- GIVEN items `["Cambio SSD", "Limpieza"]`
- WHEN duplicates checked
- THEN empty result
