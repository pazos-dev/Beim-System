# Gestion API Specification

## Purpose

Server-authoritative management resources (`/api/v1/...`, plural nouns): receipts/boleta, sales-batch, financial-state, stock, cash-sessions, clients, services, purchases, categories. Envelope `{ ok, data | error }`.

## Requirements

### Requirement: Envelope and Server-Side Validation

The system MUST validate every gestion request server-side and MUST respond with `{ ok, data | error }` plus correct HTTP status. It MUST NOT trust client coercion or role claims.

#### Scenario: Valid receipt create

- GIVEN an authenticated gestion user with role permitting sales
- WHEN POST `/api/v1/receipts` with complete valid body
- THEN status 201 AND `ok:true` with created receipt in `data`

#### Scenario: Invalid body rejected

- GIVEN any authenticated caller
- WHEN POST `/api/v1/sales-batch` with negative price or missing client document
- THEN status 422 AND `ok:false` with field-level `error` AND no state change

### Requirement: Receipt and Sales-Batch Atomicity

The system MUST execute sales-batch and annul inside one transaction: lock products `FOR UPDATE`, require `stock >= qty`, decrement, insert receipt + payload, rollback on any failure. Annul MUST restore stock and mark `Cancelado`, price `0`, payment `Sin abonar`.

#### Scenario: Batch decrements atomically

- GIVEN products with sufficient stock
- WHEN POST `/api/v1/sales-batch` with two consuming line items
- THEN receipt created AND all stocks decremented AND single transaction committed

#### Scenario: Insufficient stock aborts

- GIVEN a product with stock 1 and requested qty 2
- WHEN POST `/api/v1/sales-batch`
- THEN status 409 AND nothing persisted AND error reports current stock

#### Scenario: Annul restores stock

- GIVEN an `Entregado` receipt consuming stock
- WHEN POST `/api/v1/receipts/{id}/annul`
- THEN status changes to `Cancelado` AND consumed quantities restored

### Requirement: Financial-State Singleton and Cash Sessions

The system MUST treat `gestion_financial_state` as singleton (`singleton_id=1` upsert) and MUST scope expenses/movements to the open cash session. It MUST reject writes to a closed session.

#### Scenario: Singleton upsert

- GIVEN no financial-state row exists
- WHEN PUT `/api/v1/financial-state` with capital and preferences
- THEN one row with `singleton_id=1` exists AND response echoes it

#### Scenario: Closed session blocks movement

- GIVEN cash session `S1` closed
- WHEN POST `/api/v1/cash-sessions/S1/movements`
- THEN status 409 AND movement not recorded
