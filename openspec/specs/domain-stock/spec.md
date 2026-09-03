# Domain Stock Specification

## Purpose

Stock validation, movement computation, weighted-average cost, and transfer rules.

## Requirements

### Requirement: Stock Sufficiency Check

The system SHALL reject deductions when available stock < requested quantity.

#### Scenario: Sufficient stock

- GIVEN `stock: 10`, requested `5`
- WHEN validated
- THEN no error

#### Scenario: Insufficient stock

- GIVEN `stock: 3`, requested `5`
- WHEN validated
- THEN `DomainError` thrown

### Requirement: Min Stock Threshold

The system SHALL flag products where stock falls below `minStock`.

#### Scenario: Below minimum

- GIVEN `stock: 2`, `minStock: 5`
- WHEN checked
- THEN flagged

#### Scenario: Above minimum

- GIVEN `stock: 10`, `minStock: 5`
- WHEN checked
- THEN not flagged

### Requirement: Movement Balance After

The system SHALL compute `balanceAfter` = previous balance + signed quantity.

#### Scenario: Sale

- GIVEN previous balance `10`, quantity `-3`
- WHEN computed
- THEN `balanceAfter` = `7`

#### Scenario: Purchase

- GIVEN previous balance `5`, quantity `+10`
- WHEN computed
- THEN `balanceAfter` = `15`

### Requirement: Weighted Average Cost

The system SHALL compute `((oldStock × oldCost) + (newQty × newCost)) / (oldStock + newQty)` when combined stock > 0, else use `newCost`.

#### Scenario: WAC with positive stock

- GIVEN `oldStock: 10`, `oldCost: 100`, `newQty: 5`, `newCost: 120`
- WHEN computed
- THEN `≈106.67`

#### Scenario: WAC from zero stock

- GIVEN `oldStock: 0`, `newQty: 5`, `newCost: 120`
- WHEN computed
- THEN `120`

### Requirement: Purchase Validation

The system SHALL require `productId`, positive integer `quantity`, non-negative `unitCost`, `categoryId`, `brand`, `model`.

#### Scenario: Valid purchase

- GIVEN all required fields present and valid
- WHEN validated
- THEN no error

#### Scenario: Missing field

- GIVEN `categoryId: ""`
- WHEN validated
- THEN `DomainError` thrown

#### Scenario: Invalid quantity

- GIVEN `quantity: -1`
- WHEN validated
- THEN `DomainError` thrown

### Requirement: Transfer Source Guard

The system SHALL reject transfers from products with `productType` in `["repuesto", "servicio", "taller", "insumo", "herramienta"]`.

#### Scenario: Web product allowed

- GIVEN source product with no `productType`
- WHEN transfer validated
- THEN no error

#### Scenario: Workshop product rejected

- GIVEN source product with `productType: "taller"`
- WHEN transfer validated
- THEN `DomainError` thrown

### Requirement: Paired Transfer Movements

The system SHALL create two movements: `web_transfer_out` (negative, source) and `web_transfer_in` (positive, destination).

#### Scenario: Paired movements

- GIVEN transfer of `5` units from `p1` to destination
- WHEN movements generated
- THEN `web_transfer_out` with `quantity: -5` for `p1`
- AND `web_transfer_in` with `quantity: 5` for destination

#### Scenario: Destination ID derivation

- GIVEN source ID `p1`
- WHEN destination computed
- THEN `workshop-web-p1`

### Requirement: Purchase Annulment Stock Guard

The system SHALL reject purchase annulment when current stock < purchase quantity.

#### Scenario: Sufficient stock to reverse

- GIVEN `stock: 10`, purchase `quantity: 5`
- WHEN annulment processed
- THEN stock decreases by `5`

#### Scenario: Insufficient stock to reverse

- GIVEN `stock: 3`, purchase `quantity: 5`
- WHEN annulment attempted
- THEN `DomainError` thrown
