# Delta for Domain Payment

## ADDED Requirements

### Requirement: Payment Status Normalization

The system SHALL normalize: `Pagado`→`Pagado`, `Seña|Sena|Parcial`→`Seña`, default→`Sin abonar`.

#### Scenario: Paid

- GIVEN `"Pagado"`
- WHEN normalized
- THEN `"Pagado"`

#### Scenario: Partial

- GIVEN `"Parcial"`
- WHEN normalized
- THEN `"Seña"`

#### Scenario: Unpaid default

- GIVEN `""`
- WHEN normalized
- THEN `"Sin abonar"`

### Requirement: Stock Commitment Guard

The system SHALL prevent reverting payment status from `"Pagado"` once `stockCommitted` is `true`.

#### Scenario: Revert blocked after commit

- GIVEN `stockCommitted: true`, `paymentStatus: "Pagado"`
- WHEN transition to `"Pendiente de pago"` attempted
- THEN `DomainError` thrown (stock committed, cannot revert)

#### Scenario: Revert allowed before commit

- GIVEN `stockCommitted: false`, `paymentStatus: "Pagado"`
- WHEN transition to `"Pendiente de pago"` attempted
- THEN no error

### Requirement: Stock Deduction on Paid Status

The system SHALL deduct stock for each order item when payment becomes `"Pagado"` and `stockCommitted` is `false`.

#### Scenario: Deducts on confirmation

- GIVEN `stockCommitted: false`, items `[{productId:"p1", quantity:2}]`
- WHEN status becomes `"Pagado"`
- THEN stock of `p1` decreases by `2`
- AND `stockCommitted` becomes `true`

#### Scenario: Skips if already committed

- GIVEN `stockCommitted: true`
- WHEN status is `"Pagado"`
- THEN no deduction

### Requirement: Annulment Reason Required

The system SHALL reject annulment when `reason` is empty or whitespace.

#### Scenario: Empty reason rejected

- GIVEN `reason: ""`
- WHEN annulment processed
- THEN `DomainError` thrown

#### Scenario: Valid reason accepted

- GIVEN `reason: "Cliente solicitó"`
- WHEN validated
- THEN no error

### Requirement: Annulment Duplicate Guard

The system SHALL detect duplicates via `stockRestoredAt` and `financialReversedAt` and skip reprocessing.

#### Scenario: Duplicate detected

- GIVEN receipt with both `stockRestoredAt` and `financialReversedAt` set
- WHEN annulment attempted
- THEN `duplicate: true`, no stock restored

#### Scenario: First annulment processes

- GIVEN receipt with neither flag set
- WHEN annulment processed
- THEN stock restored, both flags set

### Requirement: Stock Restoration on Annulment

The system SHALL restore stock quantities for each item in the receipt payload.

#### Scenario: Restores per item

- GIVEN items `[{productId:"p1", quantity:3}, {productId:"p2", quantity:1}]`
- WHEN annulment processed
- THEN `p1` stock +3, `p2` stock +1

#### Scenario: Skips invalid items

- GIVEN item `[{productId:"", quantity:0}]`
- WHEN annulment processed
- THEN no movement created for that item
