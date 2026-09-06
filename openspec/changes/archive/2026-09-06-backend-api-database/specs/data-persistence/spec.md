# Data Persistence Specification

## Purpose

Repository ports with swappable adapters (file now, Postgres later). Carries the 15-table `schema.sql` contract; options 1 (REST+Postgres) vs 4 (hybrid ports) costed in proposal.

## Requirements

### Requirement: Repository Ports and Adapters

The system MUST access persistence only through repository ports; file adapters MUST be the default and Postgres adapters MUST implement the same port without API changes.

#### Scenario: Adapter swap

- GIVEN gestion-api running on file adapters
- WHEN storage backend switches to Postgres
- THEN all gestion/webshop endpoints keep request/response contracts

### Requirement: Transaction and Stock Safety

The system MUST serialize stock mutations per product (`FOR UPDATE` or equivalent guard), enforce `stock >= qty`, and MUST roll back partial writes. File adapters MUST document oversell risk as interim.

#### Scenario: Concurrent decrement safe

- GIVEN product stock 1 and two concurrent sales of qty 1
- WHEN both batches execute
- THEN exactly one succeeds AND the other fails with 409

#### Scenario: JSONB backward compatibility

- GIVEN a legacy `beim_receipts.payload` backup
- WHEN restored through the repository
- THEN receipt reads succeed AND unknown payload keys preserved
