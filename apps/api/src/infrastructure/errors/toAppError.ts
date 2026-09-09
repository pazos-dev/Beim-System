/**
 * Error-boundary facade (task 1.2, reconciled with slice 0.2).
 *
 * The canonical mapper already lives in
 * `infrastructure/persistence/error-map.ts` (`toAppError`: 23505→CONFLICT,
 * FK→404/409, lock→CONFLICT, else INTERNAL_ERROR, frozen messages only,
 * zero driver text). This module re-exports it so adapter code imports the
 * boundary from `infrastructure/errors/` — single implementation, no fork.
 */
export { toAppError } from "../persistence/error-map.js";
