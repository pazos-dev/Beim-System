# Domain Client Specification

## Purpose

Client validation rules and defaults for the gestion module.

## Requirements

### Requirement: Client Name Required

The system SHALL reject client creation when `name` is empty or whitespace-only.

#### Scenario: Valid name

- GIVEN `name: "Juan Perez"`
- WHEN validated
- THEN no error

#### Scenario: Empty name rejected

- GIVEN `name: ""`
- WHEN validated
- THEN `DomainError` thrown

#### Scenario: Whitespace-only rejected

- GIVEN `name: "   "`
- WHEN validated
- THEN `DomainError` thrown

### Requirement: Default Client

The system SHALL use `"Cliente Mostrador"` as the default client when none is specified.

#### Scenario: No client provided

- GIVEN no client for a sale
- WHEN default resolved
- THEN name is `"Cliente Mostrador"`

#### Scenario: Explicit client preserved

- GIVEN client `{name: "Ana Perez"}`
- WHEN used
- THEN name is `"Ana Perez"`

### Requirement: Document Normalization

The system SHALL trim whitespace and default to `"-"` when document is empty.

#### Scenario: Trim

- GIVEN document `" 12345678 "`
- WHEN normalized
- THEN `"12345678"`

#### Scenario: Empty defaults

- GIVEN document `""`
- WHEN normalized
- THEN `"-"`

### Requirement: Client Defaults for Missing Fields

The system SHALL default `phone` to `"-"` and `email` to `""` when not provided.

#### Scenario: Missing phone

- GIVEN client without `phone`
- WHEN defaults applied
- THEN `phone` is `"-"`

#### Scenario: Missing email

- GIVEN client without `email`
- WHEN defaults applied
- THEN `email` is `""`
