# Delta for gestion-clients

## ADDED Requirements

### Requirement: Clients List

The clients page SHALL render a table of clients sourced from `@beim/data` (`listClients`). Each row SHALL show name, document, phone, email, and row actions.

#### Scenario: List renders clients

- GIVEN the data layer returns three clients
- WHEN the clients page renders
- THEN a table row is shown for each client with name, document, phone, and email

#### Scenario: Empty list renders empty state

- GIVEN no clients exist in the data layer
- WHEN the clients page renders
- THEN an empty-state message is shown and no table rows render

### Requirement: Client Search and Filter

The clients page SHALL provide a search input that filters the displayed clients by name or document (case-insensitive). Filtering MAY be client-side over the loaded list.

#### Scenario: Filter by name

- GIVEN clients "Ana Perez" and "Carlos Lopez" exist
- WHEN a user types "ana" in the search input
- THEN only the "Ana Perez" row remains visible

#### Scenario: No match shows empty state

- GIVEN the search term matches no client
- WHEN the user types a non-matching term
- THEN the table shows an empty/not-found state

### Requirement: Client Detail View

The clients page SHALL support viewing a single client's detail, including all editable fields, sourced from `@beim/data` (`getClientById`).

#### Scenario: View existing client

- GIVEN a client exists with a known ID
- WHEN the user opens that client's detail
- THEN the detail view shows the client's name, document, phone, and email
- AND unknown or missing clients render a not-found state

### Requirement: Client Create

The clients page SHALL support creating a client via an inline form. The submitted payload SHALL be validated against the `@beim/contracts` `clientSchema` before persistence via `@beim/data` (`upsertClient`). A client SHALL NOT be created with an invalid payload.

#### Scenario: Create valid client

- GIVEN a user fills the form with a name and optional fields
- WHEN the form is submitted and validation passes
- THEN `upsertClient` is called and the new client appears in the list

#### Scenario: Reject invalid client

- GIVEN a user submits a form with a missing required name
- WHEN validation runs against `clientSchema`
- THEN inline validation errors are shown
- AND no client is persisted

### Requirement: Client Edit

The clients page SHALL support editing an existing client via the form, persisted through `@beim/data` (`upsertClient`) after validation.

#### Scenario: Edit existing client

- GIVEN an existing client is in edit mode and the name is changed
- WHEN the form is submitted and validates
- THEN the client is updated and the updated values render in the list

### Requirement: Client Delete

The clients page SHALL support deleting a client. Deletion SHALL require confirmation before invoking the data layer.

#### Scenario: Delete confirmed

- GIVEN a user triggers delete for a client and confirms
- WHEN the data layer delete succeeds
- THEN the client is removed from the list and no longer returned by `listClients`

#### Scenario: Deletion cancelled

- GIVEN a user triggers delete for a client
- WHEN the user cancels the confirmation prompt
- THEN the client remains in the list and no delete call is made

### Requirement: Mocked Data Layer in Tests

Unit tests for the clients domain SHALL stub the `@beim/data` access functions with a mocked database, so CRUD behavior is verified without a real PostgreSQL connection.

#### Scenario: Unit test runs without DB

- GIVEN the clients access functions are mocked
- WHEN the CRUD unit tests run
- THEN they pass without connecting to a real database

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.
