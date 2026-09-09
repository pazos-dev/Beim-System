# routes-table Specification

## Purpose

Single route table (`src/routes/`) owning path, roles, label, icon, and gate for `apps/gestion`, with `AppShell`/`Sidebar` as the single layout rendering from the table.

## Requirements

### Requirement: Route table covers all paths

The system MUST declare every current app path in `src/routes/` with `{ path, roles, label, icon, gate }`; no page path SHALL exist outside the table.

#### Scenario: Table covers all paths

- GIVEN the deployed app paths (ordenes, clientes, ventas, compras, stock, servicios, caja, reportes, configuracion, audit)
- WHEN each path is looked up in the route table
- THEN every path has an entry with roles and label

#### Scenario: Unknown path is rejected

- GIVEN a path not present in the route table
- WHEN navigation is attempted
- THEN the app renders the not-found route, not an unlisted page

### Requirement: Role gating enforced from the table

The system MUST enforce per-route `roles` at the gate: actors lacking the route role MUST NOT see the route content.

#### Scenario: Authorized role renders route

- GIVEN an actor whose role is listed for `/app/caja`
- WHEN the actor navigates to `/app/caja`
- THEN the route content renders

#### Scenario: Unauthorized role is blocked

- GIVEN an actor whose role is absent for `/app/caja`
- WHEN the actor navigates to `/app/caja`
- THEN the app renders the access-denied state, not the route content

### Requirement: Sidebar renders from the table

The `Sidebar` MUST render its menu exclusively from the route table (labels, icons, role filtering); it MUST NOT hardcode menu entries.

#### Scenario: Sidebar reflects table and role

- GIVEN an actor with a restricted role set
- WHEN the sidebar renders
- THEN visible entries exactly equal table entries whose `roles` include the actor role
- AND adding a table entry adds a sidebar item with no sidebar code change

### Requirement: Single layout composition

`AppShell` MUST be the single layout composition (persistent sidebar); pages MUST NOT define competing layouts.

#### Scenario: Layout persists across navigation

- GIVEN the user navigates between two table routes
- WHEN the second route renders
- THEN the same `AppShell` instance persists (sidebar state preserved)
