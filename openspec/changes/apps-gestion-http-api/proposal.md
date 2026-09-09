# Proposal: apps-gestion HTTP API (Bearer session + HTTP clientes)

## Intent

Bind `apps/gestion` to the live Express 5 backend (`/api/v1`) without changing observable behavior: Bearer-token session replaces the JsonStore-backed auth vertical, and an HTTP clientes adapter replaces `JsonClienteRepository` behind the frozen `ClienteRepositoryPort`. No live backend in tests; all coverage uses recorded fixtures shaped from the verified contract.

## Capabilities

### New Capabilities
- `bearer-session`: in-memory Bearer login/logout, header injection, bootstrap/gate wiring, 404-vs-403 rendering.
- `http-clientes`: HTTP clientes adapter on the port, `useClientList`/detail hooks, frozen keys, typed parse, invalidation.

### Modified Capabilities
- None (JsonStore removal explicitly OUT; per-slice deletions happen later; other domains OUT).

## Non-goals
- `apps/api/**` untouched; admin user/role endpoints out of scope; persistence swap beyond clientes out of scope.
