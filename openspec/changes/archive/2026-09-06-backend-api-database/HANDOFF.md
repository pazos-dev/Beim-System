# HANDOFF: backend-api-database

> **NOTE: SUPERSEDED BY REVISION.** The change has been fully implemented (PRs 1–4, see `design.md` REVISION 2026-09-05 and `tasks.md` all checkboxes done). This handoff kept as historical record only; it no longer reflects the applied state.

> Mechanical handoff from SOLO SPECS track (System-Beim-workflow) to apply target (Beim-System-Tech).
> Source: /home/zero/Projects/System-Beim-workflow/openspec/changes/backend-api-database/
> Destination: /home/zero/Projects/Beim-System-Tech/openspec/changes/backend-api-database/

## Cached session decisions (apply MUST use)

| Decision | Value |
|---|---|
| delivery_strategy | auto-chain |
| chain_strategy | stacked-to-main |
| review_budget_lines | 400 |
| apply location | Beim-System-Tech (this repo) |
| track note | SOLO SPECS ended at handoff; apply DISPATCHES HERE |

## Validator notes carried into apply (non-blocking)

- ERROR_CODES map must add 422 (field validation) and 415 (upload media type) — task 1.2
- Mutex contract test = task 2.4 RED (exactly one success, one 409), active in contract suite 2.5
- `/api/v1` mount coexistence = tasks 3.4 + 5.1; 23 unversioned `app/api/gestion/*` route dirs exist in this repo
- Schema count: reference `pagina-web/db/schema.sql` confirms **19** CREATE TABLE (exploration/proposal said 15; task 5.2 reconciles docs)
- Webshop target is `pagina-web/`, NOT `apps/web` (apps/web does not exist here) — Phase 4

## Chain slices (stacked-to-main order)

1. PR 1 Foundation: ports, 422/415 mapping, fixtures (~400 lines)
2. PR 2 File adapters + mutex + RED concurrency test (~450 lines)
3. PR 3 Gestion API handlers + /api/v1 mounts
4. PR 4 Webshop API in pagina-web/

Each slice = one work-unit commit set, one native review gate, merge to main in order.

## Source of truth

- Original artifacts (unchanged) in System-Beim-workflow openspec/changes/backend-api-database/
- Engram topics sdd/backend-api-database/{explore,proposal,spec,design,tasks} in project system-beim-workflow