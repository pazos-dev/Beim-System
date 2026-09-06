# Auth Identity Specification

## Purpose

Dual user model (`users` webshop, `gestion_users` console) with `gestion_web_access_tokens` bridge. All role enforcement server-side.

## Requirements

### Requirement: Dual Model and Token Bridge

The system MUST keep web and gestion identities separate, MUST store only token hashes with expiry, and MUST reject expired or unknown tokens.

#### Scenario: Bridge token login

- GIVEN a valid unexpired bridge token for a gestion user
- WHEN POST `/api/v1/auth/gestion-access` with the token
- THEN a scoped session is issued for that user

#### Scenario: Expired token rejected

- GIVEN an expired bridge token
- WHEN POST `/api/v1/auth/gestion-access`
- THEN status 401 AND no session issued

### Requirement: Server-Side Role Enforcement

The system MUST authorize every gestion/webshop write against server roles and MUST return 403 without leaking resource existence beyond policy.

#### Scenario: Forbidden write

- GIVEN a viewer-role session
- WHEN POST `/api/v1/receipts`
- THEN status 403 AND nothing created
