# HTTP Clientes Specification

## Purpose

HTTP-backed clientes vertical: `HttpClienteRepository` implements the frozen `ClienteRepositoryPort` against `/api/v1/clients`, and `useClientList` plus detail hooks are the sole client path. Keys are frozen, parsing is zod-typed, mutations invalidate `['clientes']`. `JsonClienteRepository` removal is OUT of scope.

## Requirements

### Requirement: HTTP adapter implements the port with no behavior change

The system MUST serve all clientes reads/writes through `HttpClienteRepository` on `ClienteRepositoryPort` (base URL configurable, default `http://localhost:4000/api/v1`): list `GET /clients`, detail `GET /clients/:id`, create `POST /clients` (OPERATOR role), update `PUT /clients/:id`. The system MUST unwrap `{ ok: true, data }` and surface `{ ok: false, error }` as typed errors.

#### Scenario: List round-trip

- GIVEN recorded list fixtures
- WHEN `useClientList` executes with `{ search, active, page, limit }`
- THEN items, `total`, `page`, and `limit` match the `{ items, total, page, limit }` shape.

#### Scenario: Create returns 201 data

- GIVEN a valid OPERATOR payload fixture
- WHEN create succeeds
- THEN the created cliente from `data` is returned with status 201 semantics.

### Requirement: Query keys are frozen

The system MUST key the list as `['clientes','list',params]` and detail as `['clientes','detail',id]`. Keys MUST be array-structured, hierarchical, include all dependencies, and JSON-serializable. Each hook MUST own its factory; no shared mega-hook.

#### Scenario: List key includes params

- GIVEN params `{ search, active, page, limit }`
- WHEN `useClientList` executes
- THEN the key equals `['clientes','list',params]` exactly.

#### Scenario: Detail key scopes by id

- GIVEN cliente id `c-1`
- WHEN the detail hook executes
- THEN the key equals `['clientes','detail','c-1']`.

### Requirement: Parsing is zod-typed; strict-backend errors surface

The system MUST parse every payload with zod and MUST surface parse failures as typed errors distinct from network errors. Backend 422 (strict schema: unknown keys rejected), 401/403/404 MUST map to distinguishable error codes; unknown-key 422 MUST NOT mutate cache.

#### Scenario: Unknown key rejected without cache change

- GIVEN a create payload with an unknown key
- WHEN the recorded 422 fixture (`error.details` per field) returns
- THEN a typed validation error surfaces and cached lists are unchanged.

#### Scenario: Malformed list payload errors typed

- GIVEN a list response missing required fields
- WHEN the parser runs
- THEN a typed parse error surfaces, distinguishable from network failure.

### Requirement: Mutations invalidate the clientes scope

The system MUST invalidate `['clientes']` on settle of create/update so list and active detail queries refetch. Pagination MUST clamp `limit` to max 100.

#### Scenario: Create refreshes the list

- GIVEN a cached list with N items
- WHEN create settles successfully
- THEN `['clientes']` is invalidated and the list refetches with N+1 items.

#### Scenario: Limit clamps to 100

- GIVEN a request with `limit` 500
- WHEN the query executes
- THEN the effective `limit` is 100.

### Requirement: Clientes tests use recorded fixtures, never a live backend

The system MUST cover this spec with recorded fixtures shaped from the contract (envelope, list shape, search ILIKE, `active` true/false/all, error codes). Tests MUST NOT require a running backend or database.

#### Scenario: Offline suite is green

- GIVEN recorded fixtures for list, detail, create, update, and error cases
- WHEN the clientes suite runs offline
- THEN all scenarios pass with zero open sockets.
